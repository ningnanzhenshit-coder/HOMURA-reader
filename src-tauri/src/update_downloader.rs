use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use reqwest::{header::ACCEPT, Client, Url};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;
#[cfg(target_os = "android")]
use webpki_root_certs::TLS_SERVER_ROOT_CERTS;

const DOWNLOAD_DIR: &str = "updates";
const DOWNLOAD_ID_MAX_LEN: usize = 80;
const FILE_NAME_MAX_LEN: usize = 160;
const EMIT_INTERVAL: Duration = Duration::from_millis(100);
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);
const ALLOWED_EXTENSIONS: &[&str] = &["apk", "dmg", "exe", "msi", "deb", "rpm", "appimage"];

#[derive(Default)]
pub struct UpdateDownloadState {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
    completed: Mutex<HashMap<String, PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCommandError {
    code: String,
    message: String,
}

impl DownloadCommandError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    download_id: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    fraction: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedUpdate {
    download_id: String,
    file_name: String,
    path: String,
    size: u64,
}

fn command_error(code: &str, message: impl Into<String>) -> DownloadCommandError {
    DownloadCommandError::new(code, message)
}

fn validate_download_id(download_id: &str) -> Result<(), DownloadCommandError> {
    let valid = !download_id.is_empty()
        && download_id.len() <= DOWNLOAD_ID_MAX_LEN
        && download_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err(command_error("INVALID_DOWNLOAD", "更新下载标识无效。"))
    }
}

fn validate_file_name(file_name: &str) -> Result<(), DownloadCommandError> {
    let valid = !file_name.is_empty()
        && file_name.len() <= FILE_NAME_MAX_LEN
        && file_name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | '+')
        })
        && Path::new(file_name)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                ALLOWED_EXTENSIONS
                    .iter()
                    .any(|allowed| extension.eq_ignore_ascii_case(allowed))
            });
    if valid {
        Ok(())
    } else {
        Err(command_error("INVALID_FILE", "Release 安装包文件名无效。"))
    }
}

fn validate_asset_url(value: &str) -> Result<Url, DownloadCommandError> {
    let url =
        Url::parse(value).map_err(|_| command_error("INVALID_URL", "Release 安装包地址无效。"))?;
    let repository_prefix = "/ningnanzhenshit-coder/HOMURA-reader/releases/download/";
    let valid = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.path().starts_with(repository_prefix);
    if valid {
        Ok(url)
    } else {
        Err(command_error(
            "INVALID_URL",
            "拒绝下载非 HOMURA Release 文件。",
        ))
    }
}

fn updates_dir(app: &AppHandle) -> Result<PathBuf, DownloadCommandError> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join(DOWNLOAD_DIR))
        .map_err(|error| command_error("CACHE_UNAVAILABLE", error.to_string()))
}

#[cfg(target_os = "android")]
fn format_proxy_url(proxy: tauri_plugin_android_installer::SystemProxy) -> Option<String> {
    let host = proxy.host.trim();
    let valid = !host.is_empty()
        && host.len() <= 255
        && !host
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '@' | '#' | '?'));
    if !valid {
        return None;
    }

    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    Some(format!("http://{host}:{}", proxy.port))
}

#[cfg(target_os = "android")]
fn android_system_proxy(app: &AppHandle) -> Option<String> {
    let installer =
        app.try_state::<tauri_plugin_android_installer::AndroidInstaller<tauri::Wry>>()?;
    match installer.system_proxy() {
        Ok(proxy) => proxy.and_then(format_proxy_url),
        Err(error) => {
            eprintln!("读取 Android 系统代理失败: {error}");
            None
        }
    }
}

fn progress_payload(
    download_id: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
) -> DownloadProgress {
    DownloadProgress {
        download_id: download_id.to_string(),
        downloaded_bytes,
        total_bytes,
        fraction: total_bytes
            .filter(|total| *total > 0)
            .map(|total| (downloaded_bytes as f64 / total as f64).clamp(0.0, 1.0)),
    }
}

async fn clear_previous_downloads(
    dir: &Path,
    keep_file: Option<&Path>,
) -> Result<(), DownloadCommandError> {
    let mut entries = tokio::fs::read_dir(dir)
        .await
        .map_err(|error| command_error("CACHE_UNAVAILABLE", error.to_string()))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| command_error("CACHE_UNAVAILABLE", error.to_string()))?
    {
        let path = entry.path();
        if keep_file.is_some_and(|keep| keep == path) || !path.is_file() {
            continue;
        }
        let _ = tokio::fs::remove_file(path).await;
    }
    Ok(())
}

async fn download_asset<F>(
    dir: PathBuf,
    download_id: String,
    url: Url,
    file_name: String,
    expected_size: Option<u64>,
    proxy_url: Option<String>,
    cancelled: Arc<AtomicBool>,
    mut on_progress: F,
) -> Result<DownloadedUpdate, DownloadCommandError>
where
    F: FnMut(&str, u64, Option<u64>) + Send,
{
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| command_error("CACHE_UNAVAILABLE", error.to_string()))?;
    clear_previous_downloads(&dir, None).await?;

    let destination = dir.join(&file_name);
    let partial = dir.join(format!("{file_name}.part"));
    let _ = tokio::fs::remove_file(&partial).await;

    let client_builder = Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(IDLE_TIMEOUT)
        .timeout(Duration::from_secs(30 * 60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(format!("HOMURA/{}", env!("CARGO_PKG_VERSION")));
    #[cfg(target_os = "android")]
    let client_builder = match proxy_url.as_deref() {
        Some(proxy_url) => client_builder.proxy(
            reqwest::Proxy::all(proxy_url)
                .map_err(|error| command_error("NETWORK", error.to_string()))?,
        ),
        None => client_builder,
    };
    #[cfg(not(target_os = "android"))]
    let _ = proxy_url;
    // Android 的 rustls 平台校验器需要先经 JNI 初始化，否则请求线程会直接 panic。
    // 更新源固定为 GitHub HTTPS，这里改用随包分发的 Mozilla 根证书。
    #[cfg(target_os = "android")]
    let client_builder = client_builder.tls_certs_only(
        TLS_SERVER_ROOT_CERTS
            .iter()
            .map(|certificate| reqwest::Certificate::from_der(certificate.as_ref()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| command_error("NETWORK", error.to_string()))?,
    );
    #[cfg(test)]
    let client_builder = client_builder.no_proxy();
    let client = client_builder
        .build()
        .map_err(|error| command_error("NETWORK", error.to_string()))?;

    let mut response = client
        .get(url)
        .header(ACCEPT, "application/octet-stream")
        .send()
        .await
        .map_err(|error| {
            #[cfg(test)]
            eprintln!("update download request failed: {error:?}");
            command_error("NETWORK", error.to_string())
        })?;

    if !response.status().is_success() {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(command_error(
            "HTTP_ERROR",
            format!("GitHub 下载返回了 {}。", response.status().as_u16()),
        ));
    }

    let content_length = response.content_length().filter(|size| *size > 0);
    let total_bytes = content_length.or(expected_size.filter(|size| *size > 0));
    let mut file = tokio::fs::File::create(&partial)
        .await
        .map_err(|error| command_error("CACHE_WRITE_FAILED", error.to_string()))?;
    let mut downloaded_bytes = 0_u64;
    let mut last_emit = Instant::now() - EMIT_INTERVAL;

    on_progress(&download_id, 0, total_bytes);

    loop {
        if cancelled.load(Ordering::Relaxed) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(command_error("CANCELLED", "cancelled"));
        }

        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                drop(file);
                let _ = tokio::fs::remove_file(&partial).await;
                return Err(command_error("NETWORK", error.to_string()));
            }
        };

        if let Err(error) = file.write_all(&chunk).await {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(command_error("CACHE_WRITE_FAILED", error.to_string()));
        }
        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed() >= EMIT_INTERVAL {
            on_progress(&download_id, downloaded_bytes, total_bytes);
            last_emit = Instant::now();
        }
    }

    if let Err(error) = file.flush().await {
        drop(file);
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(command_error("CACHE_WRITE_FAILED", error.to_string()));
    }
    if let Err(error) = file.sync_all().await {
        drop(file);
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(command_error("CACHE_WRITE_FAILED", error.to_string()));
    }
    drop(file);

    if cancelled.load(Ordering::Relaxed) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(command_error("CANCELLED", "cancelled"));
    }
    if expected_size.is_some_and(|expected| expected > 0 && expected != downloaded_bytes) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(command_error(
            "CHECKSUM_MISMATCH",
            "安装包大小与 Release 信息不一致。",
        ));
    }

    if let Err(error) = tokio::fs::rename(&partial, &destination).await {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(command_error("CACHE_WRITE_FAILED", error.to_string()));
    }
    on_progress(&download_id, downloaded_bytes, Some(downloaded_bytes));

    Ok(DownloadedUpdate {
        download_id,
        file_name,
        path: destination.to_string_lossy().into_owned(),
        size: downloaded_bytes,
    })
}

#[tauri::command]
pub async fn download_update_asset(
    app: AppHandle,
    state: State<'_, UpdateDownloadState>,
    download_id: String,
    url: String,
    file_name: String,
    expected_size: Option<u64>,
) -> Result<DownloadedUpdate, DownloadCommandError> {
    validate_download_id(&download_id)?;
    validate_file_name(&file_name)?;
    let url = validate_asset_url(&url)?;

    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state
            .active
            .lock()
            .map_err(|_| command_error("DOWNLOAD_FAILED", "下载状态不可用。"))?;
        if !active.is_empty() {
            return Err(command_error("DOWNLOAD_IN_PROGRESS", "已有更新正在下载。"));
        }
        active.insert(download_id.clone(), cancelled.clone());
        state
            .completed
            .lock()
            .map_err(|_| command_error("DOWNLOAD_FAILED", "下载状态不可用。"))?
            .clear();
    }

    let dir = updates_dir(&app)?;
    #[cfg(target_os = "android")]
    let proxy_url = android_system_proxy(&app);
    #[cfg(not(target_os = "android"))]
    let proxy_url = None;
    let progress_app = app.clone();
    let result = download_asset(
        dir,
        download_id.clone(),
        url,
        file_name,
        expected_size,
        proxy_url,
        cancelled,
        move |download_id, downloaded_bytes, total_bytes| {
            let _ = progress_app.emit(
                "update-download-progress",
                progress_payload(download_id, downloaded_bytes, total_bytes),
            );
        },
    )
    .await;

    if let Ok(download) = &result {
        if let Ok(mut completed) = state.completed.lock() {
            completed.insert(download_id.clone(), PathBuf::from(&download.path));
        }
    }
    if let Ok(mut active) = state.active.lock() {
        active.remove(&download_id);
    }
    result
}

#[tauri::command]
pub fn cancel_update_download(state: State<'_, UpdateDownloadState>, download_id: String) -> bool {
    let Ok(active) = state.active.lock() else {
        return false;
    };
    let Some(cancelled) = active.get(&download_id) else {
        return false;
    };
    cancelled.store(true, Ordering::Relaxed);
    true
}

#[tauri::command]
pub fn open_update_file(
    app: AppHandle,
    state: State<'_, UpdateDownloadState>,
    download_id: String,
    path: Option<String>,
) -> Result<(), DownloadCommandError> {
    validate_download_id(&download_id)?;
    let path = if let Some(path) = path.filter(|value| !value.trim().is_empty()) {
        PathBuf::from(path)
    } else {
        state
            .completed
            .lock()
            .map_err(|_| command_error("INSTALL_FAILED", "安装包状态不可用。"))?
            .get(&download_id)
            .cloned()
            .ok_or_else(|| command_error("INSTALL_FAILED", "找不到已下载的安装包。"))?
    };
    if !path.is_file() {
        return Err(command_error("INSTALL_FAILED", "安装包已被移动或删除。"));
    }

    let root = updates_dir(&app)?
        .canonicalize()
        .map_err(|error| command_error("INSTALL_FAILED", error.to_string()))?;
    let canonical = path
        .canonicalize()
        .map_err(|error| command_error("INSTALL_FAILED", error.to_string()))?;
    if !canonical.starts_with(&root) {
        return Err(command_error(
            "INSTALL_FAILED",
            "安装包路径不在应用缓存中。",
        ));
    }

    app.opener()
        .open_path(canonical.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| command_error("INSTALL_FAILED", error.to_string()))
}

#[cfg(test)]
mod tests {
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::*;

    #[test]
    fn streams_asset_to_cache() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let body = vec![0x5a; 128 * 1024];
        let expected_len = body.len();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut request_line = String::new();
            reader.read_line(&mut request_line).unwrap();
            loop {
                let mut header = String::new();
                reader.read_line(&mut header).unwrap();
                if header == "\r\n" || header.is_empty() {
                    break;
                }
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {expected_len}\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            stream.write_all(&body).unwrap();
        });

        let dir = std::env::temp_dir().join(format!(
            "homura-update-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let progress = Arc::new(Mutex::new(Vec::new()));
        let progress_sink = progress.clone();
        let result = tauri::async_runtime::block_on(download_asset(
            dir.clone(),
            "test_download".to_string(),
            Url::parse(&format!("http://{address}/HOMURA_2.2.0_universal.dmg")).unwrap(),
            "HOMURA_2.2.0_universal.dmg".to_string(),
            Some(expected_len as u64),
            None,
            Arc::new(AtomicBool::new(false)),
            move |_, downloaded, _| progress_sink.lock().unwrap().push(downloaded),
        ))
        .unwrap();
        server.join().unwrap();

        assert_eq!(result.size, expected_len as u64);
        assert_eq!(std::fs::read(&result.path).unwrap().len(), expected_len);
        assert_eq!(
            progress.lock().unwrap().last().copied(),
            Some(expected_len as u64)
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
