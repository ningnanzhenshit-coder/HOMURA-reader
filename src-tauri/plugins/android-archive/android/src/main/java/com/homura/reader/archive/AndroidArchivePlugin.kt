package com.homura.reader.archive

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
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
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val SOURCE_ROOT = "homura-native-sources"
private const val CACHE_ROOT = "homura-native-pages"
private const val MAX_ENTRIES = 20_000
private const val MAX_PAGE_BYTES = 256L * 1024 * 1024
private const val MAX_CACHE_FILES = 24
private const val MAX_CACHE_BYTES = 192L * 1024 * 1024
// 交给 WebView 的页面按屏幕长边降采样，别把整张 4K 位图塞进渲染进程
private const val MIN_PAGE_EDGE = 1280
private const val MAX_PAGE_EDGE = 2048
private const val PAGE_WEBP_QUALITY = 82
private const val PREFETCH_AHEAD = 2
// 每解出这么多页才做一次目录清理，避免每翻一页都 list + stat 整个缓存目录
private const val TRIM_EVERY_EXTRACTS = 5
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
  val entryIndexByName: Map<String, Int>,
  // 只有 CBZ 的图片条目顺序等于阅读顺序；EPUB 文档的条目索引和页序无关
  val sequentialPages: Boolean
) {
  val lock = Any()
}

private class TextEntryTooLargeException : Exception()

@TauriPlugin
class AndroidArchivePlugin(private val activity: Activity) : Plugin(activity) {
  private val sessions = HashMap<String, ArchiveSession>()
  private val extractCounters = ConcurrentHashMap<String, Int>()
  private val prefetchGenerations = ConcurrentHashMap<String, Int>()
  private val executor: ExecutorService = Executors.newFixedThreadPool(2) { runnable ->
    Thread(runnable, "homura-archive").apply { isDaemon = true }
  }
  private val prefetchExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "homura-archive-prefetch").apply { isDaemon = true }
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

        val dimensions = readPageDimensions(zipFile, entries)
        val session = createSession(options.archiveId, zipFile, entries, sequentialPages = true)
        replaceSession(session)

        JSObject().apply {
          put("archiveId", options.archiveId)
          put("entries", JSArray().apply {
            entries.forEachIndexed { index, entry ->
              put(entryJson(entry, index, dimensions[index]))
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

        val dimensions = readPageDimensions(zipFile, entries)
        val session = createSession(options.archiveId, zipFile, entries, sequentialPages = false)
        replaceSession(session)

        JSObject().apply {
          put("archiveId", options.archiveId)
          put("entries", JSArray().apply {
            entries.forEachIndexed { index, entry ->
              put(entryJson(entry, index, dimensions[index]))
            }
          })
          put("images", JSArray().apply {
            entries.forEachIndexed { index, entry ->
              if (isImageEntry(entry)) put(entryJson(entry, index, dimensions[index]))
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

      synchronized(session.lock) {
        val page = ensurePageFile(session, options.index)
        val counter = (extractCounters[session.bookId] ?: 0) + 1
        if (counter >= TRIM_EVERY_EXTRACTS) {
          extractCounters[session.bookId] = 0
          trimCache(session.bookId)
        } else {
          extractCounters[session.bookId] = counter
        }
        schedulePrefetch(session, options.index)
        page
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
      extractCounters.remove(options.bookId)
      prefetchGenerations.remove(options.bookId)
      cacheDirFor(options.bookId).deleteRecursively()
      null
    }
  }

  @Command
  fun clearAll(invoke: Invoke) {
    runAsync(invoke) {
      closeAllSessions()
      extractCounters.clear()
      prefetchGenerations.clear()
      File(activity.cacheDir, CACHE_ROOT).deleteRecursively()
      null
    }
  }

  override fun onDestroy(activity: AppCompatActivity) {
    closeAllSessions()
    executor.shutdownNow()
    prefetchExecutor.shutdownNow()
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
    entries: List<ZipEntry>,
    sequentialPages: Boolean
  ): ArchiveSession {
    val indexByName = entries
      .mapIndexed { index, entry -> entry.name to index }
      .toMap()
    return ArchiveSession(archiveId, archiveId, zipFile, entries, indexByName, sequentialPages)
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

  private fun entryJson(
    entry: ZipEntry,
    index: Int,
    dimensions: Pair<Int, Int>? = null
  ): JSObject {
    return JSObject().apply {
      put("index", index)
      put("name", entry.name)
      put("path", entry.name)
      put("size", entry.size)
      put("mime", mimeFor(entry.name))
      if (dimensions != null && dimensions.first > 0 && dimensions.second > 0) {
        put("width", dimensions.first)
        put("height", dimensions.second)
      }
    }
  }

  // 只读图片头拿固有尺寸。条漫在图片懒加载前就能按真实比例占位，
  // 整卷高度不会随每一页解码完成而向上或向下生长。
  private fun readPageDimensions(zipFile: ZipFile, entries: List<ZipEntry>): List<Pair<Int, Int>> {
    return entries.map { entry ->
      if (!isImageEntry(entry) || entry.size > MAX_PAGE_BYTES) {
        Pair(0, 0)
      } else {
        try {
          val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          zipFile.getInputStream(entry).use { input ->
            BitmapFactory.decodeStream(input, null, options)
          }
          if (options.outWidth > 0 && options.outHeight > 0) {
            Pair(options.outWidth, options.outHeight)
          } else {
            Pair(0, 0)
          }
        } catch (_: Throwable) {
          Pair(0, 0)
        }
      }
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

  private fun safeExtension(entryName: String): String {
    val extension = entryName.substringAfterLast('.', "img").lowercase()
    return when (extension) {
      "jpg", "jpeg", "png", "webp", "gif", "avif", "bmp" -> extension
      else -> "img"
    }
  }

  private fun cachedPageFile(dir: File, base: String, entryName: String): File? {
    val webp = File(dir, "$base.webp")
    if (webp.isFile && webp.length() > 0L) return webp
    // -raw 前缀用来区分旧版直接缓存的 00001.jpg，避免升级后继续吃全尺寸旧缓存
    val original = File(dir, "$base-raw.${safeExtension(entryName)}")
    if (original.isFile && original.length() > 0L) return original
    return null
  }

  private fun ensurePageFile(session: ArchiveSession, index: Int): JSObject {
    val entry = session.entries.getOrNull(index)
      ?: throw IllegalStateException("页面索引越界")
    val dir = cacheDirFor(session.bookId)
    val base = "%05d".format(index)
    val cached = cachedPageFile(dir, base, entry.name)
    if (cached != null) {
      cached.setLastModified(System.currentTimeMillis())
      return pageJson(cached)
    }

    dir.mkdirs()
    val source = File(dir, "$base.src")
    val target = File(dir, "$base.webp")
    val temporary = File(dir, "$base.webp.part")
    try {
      extractEntry(session, entry, source)
      if (transcodePage(source, temporary, entry.name)) {
        if (target.exists() && !target.delete()) throw IllegalStateException("无法替换页面缓存")
        if (!temporary.renameTo(target)) {
          temporary.copyTo(target, overwrite = true)
          temporary.delete()
        }
        target.setLastModified(System.currentTimeMillis())
        return pageJson(target)
      }

      // 动图或当前系统不支持解码的格式：保留原图，行为与旧版一致
      val fallback = File(dir, "$base-raw.${safeExtension(entry.name)}")
      if (fallback.exists() && !fallback.delete()) throw IllegalStateException("无法替换页面缓存")
      if (!source.renameTo(fallback)) {
        source.copyTo(fallback, overwrite = true)
      }
      fallback.setLastModified(System.currentTimeMillis())
      return pageJson(fallback)
    } finally {
      source.delete()
      temporary.delete()
    }
  }

  private fun pageJson(file: File): JSObject {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    try {
      BitmapFactory.decodeFile(file.path, bounds)
    } catch (_: Throwable) {
      // 尺寸只用于调试，读不出来不影响显示
    }
    return JSObject().apply {
      put("path", file.absolutePath)
      put("mime", mimeFor(file.name))
      put("size", file.length())
      if (bounds.outWidth > 0) put("width", bounds.outWidth)
      if (bounds.outHeight > 0) put("height", bounds.outHeight)
    }
  }

  private fun pageTargetEdge(): Int {
    val metrics = activity.resources.displayMetrics
    return max(metrics.widthPixels, metrics.heightPixels).coerceIn(MIN_PAGE_EDGE, MAX_PAGE_EDGE)
  }

  // 返回 false 表示这张图不能安全转码（GIF / 未知格式），调用方保留原图
  private fun transcodePage(source: File, target: File, entryName: String): Boolean {
    if (entryName.endsWith(".gif", ignoreCase = true)) return false

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(source.path, bounds)
    val sourceWidth = bounds.outWidth
    val sourceHeight = bounds.outHeight
    if (sourceWidth <= 0 || sourceHeight <= 0) return false

    val edge = pageTargetEdge()
    var sampleSize = 1
    while (max(sourceWidth, sourceHeight) / (sampleSize * 2) >= edge) sampleSize *= 2

    val options = BitmapFactory.Options().apply {
      inSampleSize = sampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val decoded = try {
      BitmapFactory.decodeFile(source.path, options)
    } catch (_: Throwable) {
      null
    } ?: return false

    var output: Bitmap = decoded
    try {
      val scale = min(1f, edge.toFloat() / max(decoded.width, decoded.height))
      if (scale < 1f) {
        output = Bitmap.createScaledBitmap(
          decoded,
          max(1, (decoded.width * scale).roundToInt()),
          max(1, (decoded.height * scale).roundToInt()),
          true
        )
      }
      val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Bitmap.CompressFormat.WEBP_LOSSY
      } else {
        @Suppress("DEPRECATION")
        Bitmap.CompressFormat.WEBP
      }
      val written = FileOutputStream(target).use { stream ->
        output.compress(format, PAGE_WEBP_QUALITY, stream)
      }
      return written && target.length() > 0L
    } catch (_: Throwable) {
      return false
    } finally {
      if (output !== decoded) output.recycle()
      decoded.recycle()
    }
  }

  // 当前页解完后，在独立线程提前转码后两页；翻过去时直接命中缓存
  private fun schedulePrefetch(session: ArchiveSession, currentIndex: Int) {
    // 文档模式的 index 是 ZIP 条目索引，不是阅读页序，预取会转码无关页并占用会话锁
    if (!session.sequentialPages) return
    val generation = (prefetchGenerations[session.bookId] ?: 0) + 1
    prefetchGenerations[session.bookId] = generation
    val archiveId = session.id
    prefetchExecutor.execute {
      for (offset in 1..PREFETCH_AHEAD) {
        val index = currentIndex + offset
        if (index >= session.entries.size) return@execute
        if (prefetchGenerations[session.bookId] != generation) return@execute
        if (synchronized(sessions) { sessions[archiveId] } !== session) return@execute
        try {
          synchronized(session.lock) {
            if (prefetchGenerations[session.bookId] != generation) return@synchronized
            ensurePageFile(session, index)
          }
        } catch (_: Throwable) {
          // 预取失败不影响当前阅读，真正翻到该页时会再试
        }
      }
    }
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
      .listFiles { file -> file.isFile && !file.name.endsWith(".part") && !file.name.endsWith(".src") }
      ?.sortedBy { it.lastModified() }
      ?: return
    var total = files.sumOf { it.length() }
    var count = files.size
    // 按最近访问时间淘汰，不能按文件序号划窗口：
    // EPUB 的图片条目顺序和实际阅读页序无关，按序号删会误伤刚看过的相邻页。
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
