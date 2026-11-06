/* ============================================================================
HOMURA · 桌面原生导入
----------------------------------------------------------------------------
系统选择器返回真实路径后，由 Rust 直接复制到 AppData 的原生存档目录，
避免大文件先进入 WebView Blob，再经 IPC 与 fs 插件二次搬运。
只接受 dialog 插件动态授权过的路径，并把所有写入限制在 native-sources 内。
========================================================================== */

use serde::Serialize;
use std::fs::{self, File};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

const SOURCE_ROOT: &str = "homura-native-sources";
const MAX_IMPORT_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_SCAN_ENTRIES: usize = 20_000;
const MAX_SCAN_ROOTS: usize = 4_096;
const MAX_SCAN_DEPTH: usize = 64;
const MAX_FILE_NAME_CHARS: usize = 180;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedImportFile {
    native_path: String,
    name: String,
    size: u64,
    modified_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScanFile {
    name: String,
    path: String,
    relative_path: String,
    size: u64,
    modified_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScanResponse {
    files: Vec<ImportScanFile>,
}

fn native_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn invalid_data(message: impl AsRef<str>) -> String {
    native_error("NATIVE_INVALID_DATA", message)
}

fn limit_exceeded(message: impl AsRef<str>) -> String {
    native_error("NATIVE_LIMIT_EXCEEDED", message)
}

fn security_limit(message: impl AsRef<str>) -> String {
    native_error("NATIVE_SECURITY_LIMIT", message)
}

fn command_failed(message: impl AsRef<str>) -> String {
    native_error("NATIVE_COMMAND_FAILED", message)
}

fn safe_book_segment(value: &str) -> String {
    let segment: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .take(160)
        .collect();
    if segment.is_empty() || segment == "." || segment == ".." {
        "book".to_string()
    } else {
        segment
    }
}

fn safe_file_name(value: &str) -> String {
    let base = Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("source");
    let segment: String = base
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '_'
            } else {
                character
            }
        })
        .take(MAX_FILE_NAME_CHARS)
        .collect();
    if segment.is_empty() || segment == "." || segment == ".." {
        "source".to_string()
    } else {
        segment
    }
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn is_supported_import_name(name: &str) -> bool {
    matches!(
        name.rsplit_once('.')
            .map(|(_, extension)| extension.to_ascii_lowercase())
            .as_deref(),
        Some(
            "epub"
                | "pdf"
                | "mobi"
                | "prc"
                | "azw"
                | "cbz"
                | "zip"
                | "txt"
                | "md"
                | "jpg"
                | "jpeg"
                | "png"
                | "webp"
                | "gif"
                | "avif"
                | "bmp"
        )
    )
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.') || name == "__MACOSX"
}

fn relative_path_string(path: &Path, base: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(base)
        .map_err(|_| security_limit("扫描路径越过导入根目录"))?;
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            _ => return Err(security_limit("扫描路径包含非法目录段")),
        }
    }
    if parts.is_empty() {
        return Err(invalid_data("扫描文件缺少相对路径"));
    }
    Ok(parts.join("/"))
}

fn stage_import_path_to(
    data_root: &Path,
    book_id: &str,
    source_path: &Path,
) -> Result<StagedImportFile, String> {
    let source = source_path
        .canonicalize()
        .map_err(|error| invalid_data(format!("导入文件不存在：{error}")))?;
    let metadata = fs::metadata(&source)
        .map_err(|error| invalid_data(format!("无法读取导入文件：{error}")))?;
    if !metadata.is_file() {
        return Err(invalid_data("导入路径不是文件"));
    }
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err(limit_exceeded("单个导入文件超过 4GB"));
    }

    let name = safe_file_name(&source.file_name().unwrap_or_default().to_string_lossy());
    if !is_supported_import_name(&name) {
        return Err(invalid_data("不支持的导入文件格式"));
    }

    let book_segment = safe_book_segment(book_id);
    let source_root = data_root.join(SOURCE_ROOT);
    fs::create_dir_all(&source_root)
        .map_err(|error| command_failed(format!("创建原生存档目录失败：{error}")))?;
    let target_dir = source_root.join(&book_segment).join("source");
    fs::create_dir_all(&target_dir)
        .map_err(|error| command_failed(format!("创建书籍目录失败：{error}")))?;

    let canonical_root = source_root
        .canonicalize()
        .map_err(|error| command_failed(format!("原生存档目录不可用：{error}")))?;
    let canonical_target_dir = target_dir
        .canonicalize()
        .map_err(|error| command_failed(format!("书籍目录不可用：{error}")))?;
    if !canonical_target_dir.starts_with(&canonical_root) {
        return Err(security_limit("导入目标不在 HOMURA 存档目录内"));
    }

    let target = canonical_target_dir.join(&name);
    let token = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = canonical_target_dir.join(format!(
        ".homura-import-{}-{token}.part",
        std::process::id()
    ));

    let result = (|| {
        let copied = fs::copy(&source, &temporary)
            .map_err(|error| command_failed(format!("复制导入文件失败：{error}")))?;
        if copied != metadata.len() {
            return Err(command_failed("复制后的文件大小不一致"));
        }
        File::open(&temporary)
            .and_then(|file| file.sync_all())
            .map_err(|error| command_failed(format!("刷新导入文件失败：{error}")))?;
        if target.exists() {
            fs::remove_file(&target)
                .map_err(|error| command_failed(format!("替换旧导入文件失败：{error}")))?;
        }
        fs::rename(&temporary, &target)
            .map_err(|error| command_failed(format!("提交导入文件失败：{error}")))?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }

    let copied_metadata = fs::metadata(&target)
        .map_err(|error| command_failed(format!("读取导入文件信息失败：{error}")))?;
    if copied_metadata.len() != metadata.len() {
        let _ = fs::remove_file(&target);
        return Err(command_failed("原生存档回读大小不一致"));
    }

    Ok(StagedImportFile {
        native_path: format!("{SOURCE_ROOT}/{book_segment}/source/{name}"),
        name,
        size: copied_metadata.len(),
        modified_ms: modified_ms(&metadata),
    })
}

fn collect_import_files(
    root: &Path,
    base: &Path,
    current: &Path,
    depth: usize,
    files: &mut Vec<ImportScanFile>,
) -> Result<(), String> {
    if depth > MAX_SCAN_DEPTH {
        return Err(limit_exceeded("导入目录层级过深"));
    }
    let entries = fs::read_dir(current)
        .map_err(|error| command_failed(format!("读取导入目录失败：{error}")))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| command_failed(format!("读取导入目录条目失败：{error}")))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden_name(&name) {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| command_failed(format!("读取导入文件信息失败：{error}")))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_import_files(root, base, &path, depth + 1, files)?;
            continue;
        }
        if !metadata.is_file() || !is_supported_import_name(&name) {
            continue;
        }
        if files.len() >= MAX_SCAN_ENTRIES {
            return Err(limit_exceeded("导入文件数量过多"));
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| invalid_data(format!("导入文件不存在：{error}")))?;
        if !canonical.starts_with(root) {
            return Err(security_limit("导入文件越过扫描目录"));
        }
        files.push(ImportScanFile {
            name,
            path: canonical.to_string_lossy().into_owned(),
            relative_path: relative_path_string(&canonical, base)?,
            size: metadata.len(),
            modified_ms: modified_ms(&metadata),
        });
    }
    Ok(())
}

fn scan_import_paths_from(paths: &[PathBuf]) -> Result<ImportScanResponse, String> {
    if paths.is_empty() {
        return Ok(ImportScanResponse { files: Vec::new() });
    }
    if paths.len() > MAX_SCAN_ROOTS {
        return Err(limit_exceeded("一次选择的导入路径过多"));
    }

    let mut files = Vec::new();
    for raw_path in paths {
        let root = raw_path
            .canonicalize()
            .map_err(|error| invalid_data(format!("导入路径不存在：{error}")))?;
        let metadata = fs::metadata(&root)
            .map_err(|error| invalid_data(format!("无法读取导入路径：{error}")))?;
        if metadata.is_file() {
            let name = root
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            if !is_supported_import_name(&name) {
                continue;
            }
            if files.len() >= MAX_SCAN_ENTRIES {
                return Err(limit_exceeded("导入文件数量过多"));
            }
            let base = root.parent().unwrap_or_else(|| Path::new(""));
            files.push(ImportScanFile {
                name,
                path: root.to_string_lossy().into_owned(),
                relative_path: relative_path_string(&root, base)?,
                size: metadata.len(),
                modified_ms: modified_ms(&metadata),
            });
        } else if metadata.is_dir() {
            let base = root.parent().unwrap_or(&root);
            collect_import_files(&root, base, &root, 0, &mut files)?;
        } else {
            return Err(invalid_data("导入路径既不是文件也不是目录"));
        }
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(ImportScanResponse { files })
}

fn ensure_import_scope(app: &AppHandle, path: &Path) -> Result<(), String> {
    let scope = app
        .try_fs_scope()
        .ok_or_else(|| command_failed("文件系统授权不可用"))?;
    if !scope.is_allowed(path) {
        return Err(security_limit("导入路径未由系统选择器授权"));
    }
    Ok(())
}

#[tauri::command(async, rename = "stageImportPath")]
pub async fn stage_import_path(
    app: AppHandle,
    book_id: String,
    source_path: String,
) -> Result<StagedImportFile, String> {
    let source = PathBuf::from(&source_path);
    ensure_import_scope(&app, &source)?;
    let data_root = app
        .path()
        .app_data_dir()
        .map_err(|error| command_failed(format!("无法定位 AppData：{error}")))?;
    tauri::async_runtime::spawn_blocking(move || {
        stage_import_path_to(&data_root, &book_id, &source)
    })
    .await
    .map_err(|error| command_failed(format!("原生导入任务失败：{error}")))?
}

#[tauri::command(async, rename = "scanImportPaths")]
pub async fn scan_import_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<ImportScanResponse, String> {
    let roots: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    for root in &roots {
        ensure_import_scope(&app, root)?;
    }
    tauri::async_runtime::spawn_blocking(move || scan_import_paths_from(&roots))
        .await
        .map_err(|error| command_failed(format!("原生导入扫描失败：{error}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "homura-native-import-{label}-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn stages_import_inside_native_storage() {
        let data_root = temp_dir("stage");
        let source_root = temp_dir("source");
        let source = source_root.join("[测试] 第一卷.kepub.epub");
        fs::write(&source, b"epub bytes").unwrap();

        let staged = stage_import_path_to(&data_root, "../book-1", &source).unwrap();
        assert_eq!(
            staged.native_path,
            "homura-native-sources/.._book-1/source/[测试] 第一卷.kepub.epub"
        );
        assert_eq!(staged.size, 10);
        let stored = data_root.join(&staged.native_path);
        assert_eq!(fs::read(stored).unwrap(), b"epub bytes");

        let _ = fs::remove_dir_all(data_root);
        let _ = fs::remove_dir_all(source_root);
    }

    #[test]
    fn scans_supported_files_and_skips_hidden_temporary_and_symlink_entries() {
        let root = temp_dir("scan");
        let source_root = root.parent().unwrap().join(format!(
            "{}-source",
            root.file_name().unwrap().to_string_lossy()
        ));
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::create_dir_all(root.join("__MACOSX")).unwrap();
        fs::write(root.join("01.epub"), b"a").unwrap();
        fs::write(root.join("02.CBZ"), b"bb").unwrap();
        fs::write(root.join("notes.tmp"), b"tmp").unwrap();
        fs::write(root.join("nested/003.jpg"), b"jpg").unwrap();
        fs::write(root.join(".hidden/secret.epub"), b"hidden").unwrap();
        fs::write(root.join("__MACOSX/ignored.epub"), b"ignored").unwrap();

        let scan = scan_import_paths_from(&[root.clone()]).unwrap();
        let relative: Vec<String> = scan
            .files
            .iter()
            .map(|file| file.relative_path.clone())
            .collect();
        let prefix = root.file_name().unwrap().to_string_lossy();
        assert_eq!(
            relative,
            vec![
                format!("{prefix}/01.epub"),
                format!("{prefix}/02.CBZ"),
                format!("{prefix}/nested/003.jpg"),
            ]
        );
        assert_eq!(scan.files[1].size, 2);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(source_root);
    }

    #[test]
    fn rejects_unsupported_extension_and_keeps_destination_segments_safe() {
        let data_root = temp_dir("safe");
        let source_root = temp_dir("unsafe");
        let source = source_root.join("evil.tmp");
        fs::write(&source, b"no").unwrap();
        assert!(stage_import_path_to(&data_root, "book", &source)
            .unwrap_err()
            .starts_with("NATIVE_INVALID_DATA"));
        assert_eq!(safe_book_segment(".."), "book");
        assert_eq!(safe_file_name("../../ok.epub"), "ok.epub");
        assert_eq!(safe_file_name(".."), "source");

        let _ = fs::remove_dir_all(data_root);
        let _ = fs::remove_dir_all(source_root);
    }
}
