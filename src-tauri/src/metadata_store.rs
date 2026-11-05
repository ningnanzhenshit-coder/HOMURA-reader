/* ============================================================================
HOMURA · SQLite 元数据镜像
----------------------------------------------------------------------------
SQLite 保存书目、封面缩略图、书库归属与阅读进度，供启动时快速恢复。
IndexedDB 仍保存完整数据与原始文件来源；这里的每个事务只负责镜像的一份
一致快照，任何原生失败都由前端回退，不会删除 IndexedDB 中的数据。
========================================================================== */

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const DB_DIR: &str = "homura-metadata";
const DB_FILE: &str = "homura.sqlite3";
const SCHEMA_VERSION: i64 = 1;
const MAX_BOOKS: usize = 50_000;
const MAX_COLLECTIONS: usize = 5_000;
const MAX_PROGRESS_RECORDS: usize = 50_000;
const MAX_ID_CHARS: usize = 200;
const MAX_TITLE_CHARS: usize = 500;
const MAX_FORMAT_CHARS: usize = 64;
const MAX_TYPE_CHARS: usize = 32;
const MAX_COVER_BYTES: usize = 24 * 1024 * 1024;
const MAX_COVER_BASE64_CHARS: usize = ((MAX_COVER_BYTES + 2) / 3) * 4 + 4;
const MAX_COLLECTION_BOOK_IDS: usize = 50_000;
const MAX_COLLECTION_JSON_BYTES: usize = 4 * 1024 * 1024;
const MAX_PROGRESS_JSON_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookRecord {
    pub id: String,
    #[serde(rename = "type")]
    pub book_type: String,
    #[serde(default)]
    pub format: Option<String>,
    pub title: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub page_count: i64,
    #[serde(default)]
    pub added_at: i64,
    #[serde(default)]
    pub cover_base64: Option<String>,
    #[serde(default)]
    pub cover_mime: Option<String>,
    #[serde(default)]
    pub custom_cover_base64: Option<String>,
    #[serde(default)]
    pub custom_cover_mime: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRecord {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub book_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSnapshot {
    pub initialized: bool,
    pub books: Vec<BookRecord>,
    pub collections: Vec<CollectionRecord>,
    pub progress: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSnapshotInput {
    #[serde(default)]
    pub books: Vec<BookRecord>,
    #[serde(default)]
    pub collections: Vec<CollectionRecord>,
    #[serde(default)]
    pub progress: Vec<Value>,
}

pub struct MetadataState {
    connection: Mutex<Option<Connection>>,
}

impl Default for MetadataState {
    fn default() -> Self {
        Self {
            connection: Mutex::new(None),
        }
    }
}

impl MetadataState {
    fn with_connection<T>(
        &self,
        app: &AppHandle,
        action: impl FnOnce(&mut Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .connection
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.is_none() {
            let data_root = app
                .path()
                .app_data_dir()
                .map_err(|error| command_failed(format!("无法定位 AppData：{error}")))?;
            let dir = data_root.join(DB_DIR);
            fs::create_dir_all(&dir)
                .map_err(|error| command_failed(format!("创建元数据目录失败：{error}")))?;
            let connection = open_database(&dir.join(DB_FILE))?;
            *guard = Some(connection);
        }
        let connection = guard
            .as_mut()
            .ok_or_else(|| command_failed("SQLite 连接未初始化"))?;
        action(connection)
    }
}

fn native_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn command_failed(message: impl AsRef<str>) -> String {
    native_error("NATIVE_COMMAND_FAILED", message)
}

fn invalid_data(message: impl AsRef<str>) -> String {
    native_error("NATIVE_INVALID_DATA", message)
}

fn limit_exceeded(message: impl AsRef<str>) -> String {
    native_error("NATIVE_LIMIT_EXCEEDED", message)
}

fn unsupported(message: impl AsRef<str>) -> String {
    native_error("NATIVE_UNSUPPORTED", message)
}

fn db_error(label: &str, error: rusqlite::Error) -> String {
    command_failed(format!("{label}：{error}"))
}

fn open_database(path: &Path) -> Result<Connection, String> {
    let mut connection =
        Connection::open(path).map_err(|error| db_error("打开 SQLite 元数据失败", error))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| db_error("设置 SQLite 等待时间失败", error))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| db_error("启用 SQLite WAL 失败", error))?;
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|error| db_error("设置 SQLite 同步模式失败", error))?;
    initialize_schema(&mut connection)?;
    Ok(connection)
}

fn initialize_schema(connection: &mut Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| db_error("读取 SQLite 版本失败", error))?;
    if version > SCHEMA_VERSION {
        return Err(unsupported("SQLite 元数据由更新版本的 HOMURA 创建"));
    }

    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY NOT NULL,
                book_type TEXT NOT NULL,
                format TEXT,
                title TEXT NOT NULL,
                favorite INTEGER NOT NULL,
                page_count INTEGER NOT NULL,
                added_at INTEGER NOT NULL,
                cover BLOB,
                cover_mime TEXT,
                custom_cover BLOB,
                custom_cover_mime TEXT
            );
            CREATE INDEX IF NOT EXISTS books_added_at ON books(added_at DESC);
            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                book_ids_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress (
                id TEXT PRIMARY KEY NOT NULL,
                record_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS progress_updated_at ON progress(updated_at DESC);
            ",
        )
        .map_err(|error| db_error("创建 SQLite 元数据表失败", error))?;
    connection
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|error| db_error("写入 SQLite 版本失败", error))?;
    Ok(())
}

fn validate_id(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > MAX_ID_CHARS || value.contains('\0') {
        return Err(invalid_data(format!("{label}无效")));
    }
    Ok(())
}

fn validate_text(value: &str, max_chars: usize, label: &str) -> Result<(), String> {
    if value.chars().count() > max_chars {
        return Err(limit_exceeded(format!("{label}过长")));
    }
    Ok(())
}

fn decode_cover(
    encoded: &Option<String>,
    mime: &Option<String>,
    label: &str,
) -> Result<(Option<Vec<u8>>, Option<String>), String> {
    let Some(encoded) = encoded.as_deref() else {
        return Ok((None, None));
    };
    if encoded.is_empty() {
        return Ok((None, None));
    }
    if encoded.len() > MAX_COVER_BASE64_CHARS {
        return Err(limit_exceeded(format!("{label}过大")));
    }
    let bytes = STANDARD
        .decode(encoded.as_bytes())
        .map_err(|_| invalid_data(format!("{label} Base64 无效")))?;
    if bytes.len() > MAX_COVER_BYTES {
        return Err(limit_exceeded(format!("{label}过大")));
    }
    let mime = mime
        .as_deref()
        .filter(|value| value.starts_with("image/") && value.len() <= 100)
        .map(str::to_string);
    Ok((Some(bytes), mime))
}

fn validate_book(book: &BookRecord) -> Result<(), String> {
    validate_id(&book.id, "书本 ID")?;
    validate_text(&book.book_type, MAX_TYPE_CHARS, "书本类型")?;
    validate_text(&book.title, MAX_TITLE_CHARS, "书名")?;
    if let Some(format) = book.format.as_deref() {
        validate_text(format, MAX_FORMAT_CHARS, "书本格式")?;
    }
    if book.page_count < 0 || book.added_at < 0 {
        return Err(invalid_data("书本数值字段无效"));
    }
    Ok(())
}

fn upsert_book(connection: &Connection, book: &BookRecord) -> Result<(), String> {
    validate_book(book)?;
    let (cover, cover_mime) = decode_cover(&book.cover_base64, &book.cover_mime, "封面")?;
    let (custom_cover, custom_cover_mime) = decode_cover(
        &book.custom_cover_base64,
        &book.custom_cover_mime,
        "自定义封面",
    )?;
    connection
        .execute(
            "
            INSERT INTO books (
                id, book_type, format, title, favorite, page_count, added_at,
                cover, cover_mime, custom_cover, custom_cover_mime
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(id) DO UPDATE SET
                book_type = excluded.book_type,
                format = excluded.format,
                title = excluded.title,
                favorite = excluded.favorite,
                page_count = excluded.page_count,
                added_at = excluded.added_at,
                cover = excluded.cover,
                cover_mime = excluded.cover_mime,
                custom_cover = excluded.custom_cover,
                custom_cover_mime = excluded.custom_cover_mime
            ",
            params![
                book.id,
                book.book_type,
                book.format,
                book.title,
                book.favorite,
                book.page_count,
                book.added_at,
                cover,
                cover_mime,
                custom_cover,
                custom_cover_mime
            ],
        )
        .map_err(|error| db_error("写入书目失败", error))?;
    Ok(())
}

fn normalize_collection(
    collection: &CollectionRecord,
) -> Result<(String, String, i64, String), String> {
    validate_id(&collection.id, "书库 ID")?;
    validate_text(&collection.title, 80, "书库名称")?;
    if collection.book_ids.len() > MAX_COLLECTION_BOOK_IDS {
        return Err(limit_exceeded("书库中的书本数量过多"));
    }
    for book_id in &collection.book_ids {
        validate_id(book_id, "书库书本 ID")?;
    }
    let book_ids_json = serde_json::to_string(&collection.book_ids)
        .map_err(|error| invalid_data(format!("书库书目序列化失败：{error}")))?;
    if book_ids_json.len() > MAX_COLLECTION_JSON_BYTES {
        return Err(limit_exceeded("书库书目数据过大"));
    }
    Ok((
        collection.id.clone(),
        collection.title.clone(),
        collection.created_at.max(0),
        book_ids_json,
    ))
}

fn normalize_progress(record: &Value) -> Result<(String, String, i64), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_data("阅读进度缺少书本 ID"))?;
    validate_id(id, "阅读进度书本 ID")?;
    let record_json = serde_json::to_string(record)
        .map_err(|error| invalid_data(format!("阅读进度序列化失败：{error}")))?;
    if record_json.len() > MAX_PROGRESS_JSON_BYTES {
        return Err(limit_exceeded("单本书的阅读进度过大"));
    }
    let updated_at = record
        .get("updatedAt")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .max(0);
    Ok((id.to_string(), record_json, updated_at))
}

fn save_collections(
    connection: &mut Connection,
    collections: &[CollectionRecord],
) -> Result<(), String> {
    if collections.len() > MAX_COLLECTIONS {
        return Err(limit_exceeded("书库数量过多"));
    }
    let mut normalized = Vec::with_capacity(collections.len());
    for collection in collections {
        normalized.push(normalize_collection(collection)?);
    }

    let transaction = connection
        .transaction()
        .map_err(|error| db_error("开始书库事务失败", error))?;
    transaction
        .execute("DELETE FROM collections", [])
        .map_err(|error| db_error("清空旧书库失败", error))?;
    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO collections (id, title, created_at, book_ids_json)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|error| db_error("准备书库写入失败", error))?;
        for (id, title, created_at, book_ids_json) in normalized {
            statement
                .execute(params![id, title, created_at, book_ids_json])
                .map_err(|error| db_error("写入书库失败", error))?;
        }
    }
    transaction
        .commit()
        .map_err(|error| db_error("提交书库事务失败", error))
}

fn save_progress(connection: &Connection, record: &Value) -> Result<(), String> {
    let (id, record_json, updated_at) = normalize_progress(record)?;
    connection
        .execute(
            "
            INSERT INTO progress (id, record_json, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET
                record_json = excluded.record_json,
                updated_at = excluded.updated_at
            ",
            params![id, record_json, updated_at],
        )
        .map_err(|error| db_error("写入阅读进度失败", error))?;
    Ok(())
}

fn replace_all(
    connection: &mut Connection,
    snapshot: &MetadataSnapshotInput,
) -> Result<(), String> {
    if snapshot.books.len() > MAX_BOOKS {
        return Err(limit_exceeded("书目数量过多"));
    }
    if snapshot.collections.len() > MAX_COLLECTIONS {
        return Err(limit_exceeded("书库数量过多"));
    }
    if snapshot.progress.len() > MAX_PROGRESS_RECORDS {
        return Err(limit_exceeded("阅读进度记录过多"));
    }

    let transaction = connection
        .transaction()
        .map_err(|error| db_error("开始元数据迁移事务失败", error))?;
    transaction
        .execute_batch("DELETE FROM books; DELETE FROM collections; DELETE FROM progress;")
        .map_err(|error| db_error("清空旧元数据失败", error))?;
    for book in &snapshot.books {
        upsert_book(&transaction, book)?;
    }
    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO collections (id, title, created_at, book_ids_json)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|error| db_error("准备书库写入失败", error))?;
        for collection in &snapshot.collections {
            let (id, title, created_at, book_ids_json) = normalize_collection(collection)?;
            statement
                .execute(params![id, title, created_at, book_ids_json])
                .map_err(|error| db_error("写入书库失败", error))?;
        }
    }
    for record in &snapshot.progress {
        let (id, record_json, updated_at) = normalize_progress(record)?;
        transaction
            .execute(
                "INSERT INTO progress (id, record_json, updated_at) VALUES (?1, ?2, ?3)",
                params![id, record_json, updated_at],
            )
            .map_err(|error| db_error("写入阅读进度失败", error))?;
    }
    transaction
        .execute(
            "INSERT INTO settings (key, value) VALUES ('initialized', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|error| db_error("标记 SQLite 初始化失败", error))?;
    transaction
        .commit()
        .map_err(|error| db_error("提交元数据迁移事务失败", error))
}

fn load_all(connection: &Connection) -> Result<MetadataSnapshot, String> {
    let initialized = connection
        .query_row(
            "SELECT value FROM settings WHERE key = 'initialized'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| db_error("读取 SQLite 初始化标记失败", error))?
        .is_some();

    let mut books_statement = connection
        .prepare(
            "
            SELECT id, book_type, format, title, favorite, page_count, added_at,
                   cover, cover_mime, custom_cover, custom_cover_mime
            FROM books
            ORDER BY added_at DESC, id ASC
            ",
        )
        .map_err(|error| db_error("准备书目读取失败", error))?;
    let book_rows = books_statement
        .query_map([], |row| {
            let cover: Option<Vec<u8>> = row.get(7)?;
            let custom_cover: Option<Vec<u8>> = row.get(9)?;
            Ok(BookRecord {
                id: row.get(0)?,
                book_type: row.get(1)?,
                format: row.get(2)?,
                title: row.get(3)?,
                favorite: row.get::<_, i64>(4)? != 0,
                page_count: row.get(5)?,
                added_at: row.get(6)?,
                cover_base64: cover.map(|bytes| STANDARD.encode(bytes)),
                cover_mime: row.get(8)?,
                custom_cover_base64: custom_cover.map(|bytes| STANDARD.encode(bytes)),
                custom_cover_mime: row.get(10)?,
            })
        })
        .map_err(|error| db_error("读取书目失败", error))?;
    let books = book_rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| db_error("解析书目失败", error))?;

    let mut collections_statement = connection
        .prepare(
            "SELECT id, title, created_at, book_ids_json
             FROM collections ORDER BY created_at ASC, id ASC",
        )
        .map_err(|error| db_error("准备书库读取失败", error))?;
    let collection_rows = collections_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|error| db_error("读取书库失败", error))?;
    let mut collections = Vec::new();
    for row in collection_rows {
        let (id, title, created_at, book_ids_json) =
            row.map_err(|error| db_error("解析书库失败", error))?;
        let book_ids = serde_json::from_str::<Vec<String>>(&book_ids_json)
            .map_err(|error| command_failed(format!("解析书库书目失败：{error}")))?;
        collections.push(CollectionRecord {
            id,
            title,
            created_at,
            book_ids,
        });
    }

    let mut progress_statement = connection
        .prepare("SELECT record_json FROM progress ORDER BY updated_at DESC, id ASC")
        .map_err(|error| db_error("准备阅读进度读取失败", error))?;
    let progress_rows = progress_statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| db_error("读取阅读进度失败", error))?;
    let mut progress = Vec::new();
    for row in progress_rows {
        let record_json = row.map_err(|error| db_error("解析阅读进度失败", error))?;
        match serde_json::from_str::<Value>(&record_json) {
            Ok(record) => progress.push(record),
            Err(error) => eprintln!("跳过损坏的 SQLite 阅读进度：{error}"),
        }
    }

    Ok(MetadataSnapshot {
        initialized,
        books,
        collections,
        progress,
    })
}

fn delete_book(connection: &mut Connection, book_id: &str) -> Result<(), String> {
    validate_id(book_id, "书本 ID")?;
    let transaction = connection
        .transaction()
        .map_err(|error| db_error("开始删除书目事务失败", error))?;
    transaction
        .execute("DELETE FROM progress WHERE id = ?1", params![book_id])
        .map_err(|error| db_error("删除阅读进度失败", error))?;
    transaction
        .execute("DELETE FROM books WHERE id = ?1", params![book_id])
        .map_err(|error| db_error("删除书目失败", error))?;
    transaction
        .commit()
        .map_err(|error| db_error("提交删除书目事务失败", error))
}

fn clear_progress(connection: &Connection) -> Result<(), String> {
    connection
        .execute("DELETE FROM progress", [])
        .map_err(|error| db_error("清空阅读进度失败", error))?;
    Ok(())
}

fn clear_all(connection: &mut Connection) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| db_error("开始清空元数据事务失败", error))?;
    transaction
        .execute_batch("DELETE FROM books; DELETE FROM collections; DELETE FROM progress;")
        .map_err(|error| db_error("清空元数据失败", error))?;
    transaction
        .execute(
            "INSERT INTO settings (key, value) VALUES ('initialized', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|error| db_error("写入 SQLite 初始化标记失败", error))?;
    transaction
        .commit()
        .map_err(|error| db_error("提交清空元数据事务失败", error))
}

#[tauri::command]
pub fn metadata_load(
    app: AppHandle,
    state: State<'_, MetadataState>,
) -> Result<MetadataSnapshot, String> {
    state.with_connection(&app, |connection| load_all(connection))
}

#[tauri::command]
pub fn metadata_replace_all(
    app: AppHandle,
    state: State<'_, MetadataState>,
    snapshot: MetadataSnapshotInput,
) -> Result<(), String> {
    state.with_connection(&app, |connection| replace_all(connection, &snapshot))
}

#[tauri::command]
pub fn metadata_upsert_book(
    app: AppHandle,
    state: State<'_, MetadataState>,
    book: BookRecord,
) -> Result<(), String> {
    state.with_connection(&app, |connection| upsert_book(connection, &book))
}

#[tauri::command]
pub fn metadata_delete_book(
    app: AppHandle,
    state: State<'_, MetadataState>,
    book_id: String,
) -> Result<(), String> {
    state.with_connection(&app, |connection| delete_book(connection, &book_id))
}

#[tauri::command]
pub fn metadata_save_collections(
    app: AppHandle,
    state: State<'_, MetadataState>,
    collections: Vec<CollectionRecord>,
) -> Result<(), String> {
    state.with_connection(&app, |connection| {
        save_collections(connection, &collections)
    })
}

#[tauri::command]
pub fn metadata_save_progress(
    app: AppHandle,
    state: State<'_, MetadataState>,
    record: Value,
) -> Result<(), String> {
    state.with_connection(&app, |connection| save_progress(connection, &record))
}

#[tauri::command]
pub fn metadata_clear_progress(
    app: AppHandle,
    state: State<'_, MetadataState>,
) -> Result<(), String> {
    state.with_connection(&app, |connection| clear_progress(connection))
}

#[tauri::command]
pub fn metadata_clear_all(app: AppHandle, state: State<'_, MetadataState>) -> Result<(), String> {
    state.with_connection(&app, |connection| clear_all(connection))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_db() -> (PathBuf, PathBuf) {
        let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("homura-metadata-{}-{sequence}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        (dir, path)
    }

    fn book(id: &str, added_at: i64) -> BookRecord {
        BookRecord {
            id: id.to_string(),
            book_type: "manga".to_string(),
            format: Some("cbz".to_string()),
            title: format!("测试书 {id}"),
            favorite: true,
            page_count: 42,
            added_at,
            cover_base64: Some(STANDARD.encode([1, 2, 3, 4])),
            cover_mime: Some("image/webp".to_string()),
            custom_cover_base64: None,
            custom_cover_mime: None,
        }
    }

    fn collection(id: &str) -> CollectionRecord {
        CollectionRecord {
            id: id.to_string(),
            title: "主书库".to_string(),
            created_at: 123,
            book_ids: vec!["book-1".to_string()],
        }
    }

    fn progress(id: &str) -> Value {
        json!({
            "id": id,
            "index": 3,
            "total": 10,
            "ratio": 0.3,
            "updatedAt": 456
        })
    }

    #[test]
    fn replaces_loads_and_persists_snapshot() {
        let (dir, path) = temp_db();
        {
            let mut connection = open_database(&path).unwrap();
            replace_all(
                &mut connection,
                &MetadataSnapshotInput {
                    books: vec![book("book-1", 10)],
                    collections: vec![collection("collection-1")],
                    progress: vec![progress("book-1")],
                },
            )
            .unwrap();
        }

        let connection = open_database(&path).unwrap();
        let loaded = load_all(&connection).unwrap();
        assert!(loaded.initialized);
        assert_eq!(loaded.books.len(), 1);
        assert_eq!(loaded.books[0].id, "book-1");
        assert_eq!(
            loaded.books[0].cover_base64.as_deref(),
            Some(STANDARD.encode([1, 2, 3, 4]).as_str())
        );
        assert_eq!(loaded.collections.len(), 1);
        assert_eq!(loaded.progress[0]["index"], 3);
        drop(connection);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn upserts_updates_and_deletes_book_atomically() {
        let (dir, path) = temp_db();
        let mut connection = open_database(&path).unwrap();
        upsert_book(&connection, &book("book-1", 10)).unwrap();
        upsert_book(&connection, &book("book-2", 20)).unwrap();
        save_collections(&mut connection, &[collection("collection-1")]).unwrap();
        save_progress(&connection, &progress("book-1")).unwrap();
        save_progress(&connection, &progress("book-2")).unwrap();

        let mut updated = book("book-1", 10);
        updated.favorite = false;
        updated.title = "改名后的书".to_string();
        upsert_book(&connection, &updated).unwrap();
        let loaded = load_all(&connection).unwrap();
        assert_eq!(loaded.books[0].id, "book-2");
        assert_eq!(loaded.books[1].title, "改名后的书");
        assert!(!loaded.books[1].favorite);

        delete_book(&mut connection, "book-1").unwrap();
        let loaded = load_all(&connection).unwrap();
        assert_eq!(loaded.books.len(), 1);
        assert_eq!(loaded.progress.len(), 1);
        assert_eq!(loaded.progress[0]["id"], "book-2");
        drop(connection);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_invalid_or_oversized_payloads() {
        let (dir, path) = temp_db();
        let connection = open_database(&path).unwrap();

        let mut invalid_id = book("", 1);
        invalid_id.id = "x".repeat(MAX_ID_CHARS + 1);
        assert!(upsert_book(&connection, &invalid_id)
            .unwrap_err()
            .starts_with("NATIVE_INVALID_DATA"));

        let mut invalid_cover = book("book-1", 1);
        invalid_cover.cover_base64 = Some("不是 base64".to_string());
        assert!(upsert_book(&connection, &invalid_cover)
            .unwrap_err()
            .starts_with("NATIVE_INVALID_DATA"));

        assert!(normalize_progress(&json!({ "index": 1 }))
            .unwrap_err()
            .starts_with("NATIVE_INVALID_DATA"));
        assert!(normalize_collection(&CollectionRecord {
            id: "collection-1".to_string(),
            title: "书库".to_string(),
            created_at: 0,
            book_ids: vec!["x".repeat(MAX_ID_CHARS + 1)],
        })
        .unwrap_err()
        .starts_with("NATIVE_INVALID_DATA"));
        drop(connection);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn clears_progress_and_whole_snapshot() {
        let (dir, path) = temp_db();
        let mut connection = open_database(&path).unwrap();
        replace_all(
            &mut connection,
            &MetadataSnapshotInput {
                books: vec![book("book-1", 10)],
                collections: vec![collection("collection-1")],
                progress: vec![progress("book-1")],
            },
        )
        .unwrap();

        clear_progress(&connection).unwrap();
        let loaded = load_all(&connection).unwrap();
        assert!(loaded.books.len() == 1);
        assert!(loaded.progress.is_empty());

        clear_all(&mut connection).unwrap();
        let loaded = load_all(&connection).unwrap();
        assert!(loaded.initialized);
        assert!(loaded.books.is_empty());
        assert!(loaded.collections.is_empty());
        assert!(loaded.progress.is_empty());
        drop(connection);
        let _ = fs::remove_dir_all(dir);
    }
}
