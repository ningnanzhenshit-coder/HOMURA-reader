package com.homura.reader.archive

import android.app.Activity
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipFile

private const val SOURCE_ROOT = "homura-native-sources"
private const val CACHE_ROOT = "homura-native-pages"
private const val MAX_ENTRIES = 20_000
private const val MAX_PAGE_BYTES = 256L * 1024 * 1024
private const val MAX_CACHE_FILES = 24
private const val MAX_CACHE_BYTES = 192L * 1024 * 1024
private const val MAX_TEXT_PATHS = 5_000
private const val MAX_TEXT_ENTRY_BYTES = 8L * 1024 * 1024
private const val MAX_TEXT_TOTAL_BYTES = 32L * 1024 * 1024

private val IMAGE_NAME = Regex(""".*\.(jpg|jpeg|png|webp|gif|avif|bmp)$""", RegexOption.IGNORE_CASE)

@InvokeArg
class OpenOptions {
  lateinit var archiveId: String
  lateinit var path: String
}

@InvokeArg
class PageOptions {
  lateinit var archiveId: String
  var index: Int = -1
}

@InvokeArg
class CloseOptions {
  lateinit var archiveId: String
}

@InvokeArg
class CacheOptions {
  lateinit var bookId: String
}

@InvokeArg
class TextBatchOptions {
  lateinit var archiveId: String
  lateinit var pathsJson: String
}

private class ArchiveSession(
  val id: String,
  val bookId: String,
  val zipFile: ZipFile,
  val entries: List<ZipEntry>,
  val entryIndexByName: Map<String, Int>
) {
  val lock = Any()
}

private class TextEntryTooLargeException : Exception()

@TauriPlugin
class AndroidArchivePlugin(private val activity: Activity) : Plugin(activity) {
  private val sessions = HashMap<String, ArchiveSession>()
  private val executor: ExecutorService = Executors.newFixedThreadPool(2) { runnable ->
    Thread(runnable, "homura-archive").apply { isDaemon = true }
  }

  @Command
  fun open(invoke: Invoke) {
    val options = invoke.parseArgs(OpenOptions::class.java)
    runAsync(invoke) {
      val archiveFile = resolveArchiveFile(options.path)
      val zipFile = ZipFile(archiveFile)
      try {
        val entries = readImageEntries(zipFile)
        if (entries.isEmpty()) throw IllegalStateException("压缩包内未找到图片")
        if (entries.size > MAX_ENTRIES) throw IllegalStateException("压缩包图片数量过多")

        val session = createSession(options.archiveId, zipFile, entries)
        replaceSession(session)

        JSObject().apply {
          put("archiveId", options.archiveId)
          put("entries", JSArray().apply {
            entries.forEachIndexed { index, entry ->
              put(entryJson(entry, index))
            }
          })
        }
      } catch (error: Throwable) {
        zipFile.close()
        throw error
      }
    }
  }

  @Command
  fun openDocument(invoke: Invoke) {
    val options = invoke.parseArgs(OpenOptions::class.java)
    runAsync(invoke) {
      val archiveFile = resolveArchiveFile(options.path)
      val zipFile = ZipFile(archiveFile)
      try {
        val entries = readAllEntries(zipFile)
        if (entries.isEmpty()) throw IllegalStateException("压缩包内没有可读取的条目")
        if (entries.size > MAX_ENTRIES) throw IllegalStateException("压缩包条目数量过多")

        val session = createSession(options.archiveId, zipFile, entries)
        replaceSession(session)

        JSObject().apply {
          put("archiveId", options.archiveId)
          put("entries", JSArray().apply {
            entries.forEachIndexed { index, entry ->
              put(entryJson(entry, index))
            }
          })
          put("images", JSArray().apply {
            entries.forEachIndexed { index, entry ->
              if (isImageEntry(entry)) put(entryJson(entry, index))
            }
          })
        }
      } catch (error: Throwable) {
        zipFile.close()
        throw error
      }
    }
  }

  @Command
  fun extract(invoke: Invoke) {
    val options = invoke.parseArgs(PageOptions::class.java)
    runAsync(invoke) {
      val session = synchronized(sessions) { sessions[options.archiveId] }
        ?: throw IllegalStateException("压缩包会话已关闭")
      val entry = session.entries.getOrNull(options.index)
        ?: throw IllegalStateException("页面索引越界")

      synchronized(session.lock) {
        val cacheFile = File(cacheDirFor(session.bookId), cacheName(options.index, entry.name))
        if (!cacheFile.isFile || cacheFile.length() <= 0L) {
          extractEntry(session, entry, cacheFile)
        } else {
          cacheFile.setLastModified(System.currentTimeMillis())
        }
        trimCache(session.bookId)
        JSObject().apply {
          put("path", cacheFile.absolutePath)
          put("mime", mimeFor(entry.name))
          put("size", cacheFile.length())
        }
      }
    }
  }

  @Command
  fun readTextBatch(invoke: Invoke) {
    val options = invoke.parseArgs(TextBatchOptions::class.java)
    runAsync(invoke) {
      val session = synchronized(sessions) { sessions[options.archiveId] }
        ?: throw IllegalStateException("压缩包会话已关闭")
      val paths = JSONArray(options.pathsJson)
      if (paths.length() > MAX_TEXT_PATHS) throw IllegalStateException("批量读取文本条目过多")

      val texts = JSArray()
      var totalBytes = 0L
      synchronized(session.lock) {
        for (index in 0 until paths.length()) {
          if (totalBytes >= MAX_TEXT_TOTAL_BYTES) break
          val path = paths.optString(index, "")
          if (path.isEmpty()) continue
          val entryIndex = session.entryIndexByName[path] ?: continue
          val entry = session.entries[entryIndex]
          if (entry.isDirectory) continue
          if (entry.size > 0 && entry.size > MAX_TEXT_ENTRY_BYTES) continue

          val remaining = MAX_TEXT_TOTAL_BYTES - totalBytes
          val bytes = try {
            readEntryBytes(session, entry, minOf(MAX_TEXT_ENTRY_BYTES, remaining))
          } catch (_: TextEntryTooLargeException) {
            continue
          }
          totalBytes += bytes.size
          texts.put(JSObject().apply {
            put("path", path)
            put("text", bytes.toString(Charsets.UTF_8))
            put("size", bytes.size)
          })
        }
      }

      JSObject().apply {
        put("texts", texts)
        put("totalBytes", totalBytes)
      }
    }
  }

  @Command
  fun close(invoke: Invoke) {
    val options = invoke.parseArgs(CloseOptions::class.java)
    runAsync(invoke) {
      closeSession(options.archiveId)
      null
    }
  }

  @Command
  fun clearBook(invoke: Invoke) {
    val options = invoke.parseArgs(CacheOptions::class.java)
    runAsync(invoke) {
      closeBookSessions(options.bookId)
      cacheDirFor(options.bookId).deleteRecursively()
      null
    }
  }

  @Command
  fun clearAll(invoke: Invoke) {
    runAsync(invoke) {
      closeAllSessions()
      File(activity.cacheDir, CACHE_ROOT).deleteRecursively()
      null
    }
  }

  override fun onDestroy(activity: AppCompatActivity) {
    closeAllSessions()
    executor.shutdownNow()
    super.onDestroy(activity)
  }

  private fun runAsync(invoke: Invoke, task: () -> JSObject?) {
    executor.execute {
      try {
        val result = task()
        activity.runOnUiThread {
          if (result == null) invoke.resolve() else invoke.resolve(result)
        }
      } catch (error: Throwable) {
        val message = error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName
        activity.runOnUiThread { invoke.reject(message) }
      }
    }
  }

  private fun resolveArchiveFile(path: String): File {
    if (path.isBlank()) throw IllegalArgumentException("缺少压缩包路径")
    val dataRoot = activity.dataDir.canonicalFile
    val sourceRoot = File(dataRoot, SOURCE_ROOT).canonicalFile
    val candidate = if (File(path).isAbsolute) File(path) else File(dataRoot, path)
    val file = candidate.canonicalFile
    if (file != sourceRoot && !file.path.startsWith(sourceRoot.path + File.separator)) {
      throw SecurityException("压缩包路径不在 HOMURA 存档目录内")
    }
    if (!file.isFile) throw IllegalArgumentException("压缩包不存在")
    return file
  }

  private fun createSession(
    archiveId: String,
    zipFile: ZipFile,
    entries: List<ZipEntry>
  ): ArchiveSession {
    val indexByName = entries
      .mapIndexed { index, entry -> entry.name to index }
      .toMap()
    return ArchiveSession(archiveId, archiveId, zipFile, entries, indexByName)
  }

  private fun readAllEntries(zipFile: ZipFile): List<ZipEntry> {
    val entries = mutableListOf<ZipEntry>()
    val enumeration = zipFile.entries()
    while (enumeration.hasMoreElements()) {
      val entry = enumeration.nextElement()
      if (!entry.isDirectory && !entry.name.contains("__MACOSX")) {
        entries.add(entry)
        if (entries.size > MAX_ENTRIES) throw IllegalStateException("压缩包条目数量过多")
      }
    }
    entries.sortWith { left, right -> naturalCompare(left.name, right.name) }
    return entries
  }

  private fun readImageEntries(zipFile: ZipFile): List<ZipEntry> {
    val entries = mutableListOf<ZipEntry>()
    val enumeration = zipFile.entries()
    while (enumeration.hasMoreElements()) {
      val entry = enumeration.nextElement()
      if (isImageEntry(entry)) {
        entries.add(entry)
      }
    }
    entries.sortWith { left, right -> naturalCompare(left.name, right.name) }
    return entries
  }

  private fun isImageEntry(entry: ZipEntry): Boolean {
    return !entry.isDirectory && IMAGE_NAME.matches(entry.name) && !entry.name.contains("__MACOSX")
  }

  private fun entryJson(entry: ZipEntry, index: Int): JSObject {
    return JSObject().apply {
      put("index", index)
      put("name", entry.name)
      put("path", entry.name)
      put("size", entry.size)
      put("mime", mimeFor(entry.name))
    }
  }

  private fun readEntryBytes(
    session: ArchiveSession,
    entry: ZipEntry,
    maxBytes: Long
  ): ByteArray {
    if (entry.size > maxBytes) throw TextEntryTooLargeException()
    val initialSize = if (entry.size > 0) minOf(entry.size, 64L * 1024).toInt() else 8192
    val output = ByteArrayOutputStream(initialSize)
    session.zipFile.getInputStream(entry).use { input ->
      val buffer = ByteArray(32 * 1024)
      var total = 0L
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        total += read
        if (total > maxBytes) throw TextEntryTooLargeException()
        output.write(buffer, 0, read)
      }
    }
    return output.toByteArray()
  }

  private fun replaceSession(session: ArchiveSession) {
    val previous = synchronized(sessions) {
      sessions.remove(session.id)
    }
    closeSessionHandle(previous)
    synchronized(sessions) {
      sessions[session.id] = session
    }
  }

  private fun closeSession(archiveId: String) {
    val session = synchronized(sessions) { sessions.remove(archiveId) }
    closeSessionHandle(session)
  }

  private fun closeSessionHandle(session: ArchiveSession?) {
    if (session == null) return
    synchronized(session.lock) {
      session.zipFile.close()
    }
  }

  private fun closeBookSessions(bookId: String) {
    val removed = synchronized(sessions) {
      val ids = sessions.values.filter { it.bookId == bookId }.map { it.id }
      ids.mapNotNull { sessions.remove(it) }
    }
    removed.forEach(::closeSessionHandle)
  }

  private fun closeAllSessions() {
    val removed = synchronized(sessions) {
      val all = sessions.values.toList()
      sessions.clear()
      all
    }
    removed.forEach(::closeSessionHandle)
  }

  private fun cacheDirFor(bookId: String): File {
    val safeBookId = bookId.replace(Regex("[^A-Za-z0-9._-]"), "_").take(160)
    return File(File(activity.cacheDir, CACHE_ROOT), safeBookId.ifEmpty { "book" })
  }

  private fun cacheName(index: Int, entryName: String): String {
    val extension = entryName.substringAfterLast('.', "img").lowercase()
    val safeExtension = when (extension) {
      "jpg", "jpeg", "png", "webp", "gif", "avif", "bmp" -> extension
      else -> "img"
    }
    return "%05d.%s".format(index, safeExtension)
  }

  private fun extractEntry(session: ArchiveSession, entry: ZipEntry, cacheFile: File) {
    val declaredSize = entry.size
    if (declaredSize > MAX_PAGE_BYTES) throw IllegalStateException("单页图片过大")
    cacheFile.parentFile?.mkdirs()
    val temporary = File(cacheFile.parentFile, cacheFile.name + ".part")
    temporary.delete()
    try {
      session.zipFile.getInputStream(entry).use { input ->
        FileOutputStream(temporary).use { output ->
          val buffer = ByteArray(64 * 1024)
          var total = 0L
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > MAX_PAGE_BYTES) throw IllegalStateException("单页图片解压后过大")
            output.write(buffer, 0, read)
          }
        }
      }
      if (cacheFile.exists() && !cacheFile.delete()) {
        throw IllegalStateException("无法替换页面缓存")
      }
      if (!temporary.renameTo(cacheFile)) {
        temporary.copyTo(cacheFile, overwrite = true)
        temporary.delete()
      }
      cacheFile.setLastModified(System.currentTimeMillis())
    } finally {
      temporary.delete()
    }
  }

  private fun trimCache(bookId: String) {
    val files = cacheDirFor(bookId)
      .listFiles { file -> file.isFile && !file.name.endsWith(".part") }
      ?.sortedBy { it.lastModified() }
      ?: return
    var total = files.sumOf { it.length() }
    var count = files.size
    for (file in files) {
      if (count <= MAX_CACHE_FILES && total <= MAX_CACHE_BYTES) break
      val size = file.length()
      if (file.delete()) {
        total -= size
        count -= 1
      }
    }
  }

  private fun mimeFor(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
    "jpg", "jpeg" -> "image/jpeg"
    "png" -> "image/png"
    "webp" -> "image/webp"
    "gif" -> "image/gif"
    "avif" -> "image/avif"
    "bmp" -> "image/bmp"
    "xhtml", "html", "htm" -> "application/xhtml+xml"
    "xml", "opf", "ncx" -> "application/xml"
    "css" -> "text/css"
    else -> "application/octet-stream"
  }

  private fun naturalCompare(left: String, right: String): Int {
    var leftIndex = 0
    var rightIndex = 0
    while (leftIndex < left.length && rightIndex < right.length) {
      val leftChar = left[leftIndex]
      val rightChar = right[rightIndex]
      if (leftChar.isDigit() && rightChar.isDigit()) {
        val leftStart = leftIndex
        val rightStart = rightIndex
        while (leftIndex < left.length && left[leftIndex].isDigit()) leftIndex++
        while (rightIndex < right.length && right[rightIndex].isDigit()) rightIndex++
        val leftNumber = left.substring(leftStart, leftIndex).trimStart('0').ifEmpty { "0" }
        val rightNumber = right.substring(rightStart, rightIndex).trimStart('0').ifEmpty { "0" }
        val lengthCompare = leftNumber.length.compareTo(rightNumber.length)
        if (lengthCompare != 0) return lengthCompare
        val numberCompare = leftNumber.compareTo(rightNumber)
        if (numberCompare != 0) return numberCompare
      } else {
        val leftLower = leftChar.lowercaseChar()
        val rightLower = rightChar.lowercaseChar()
        if (leftLower != rightLower) return leftLower.compareTo(rightLower)
        leftIndex++
        rightIndex++
      }
    }
    return (left.length - leftIndex).compareTo(right.length - rightIndex)
  }
}
