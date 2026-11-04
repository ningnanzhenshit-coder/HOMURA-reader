package com.homura.reader.installer

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
private const val FILE_PROVIDER_SUFFIX = ".fileprovider"

@InvokeArg
class InstallOptions {
  lateinit var path: String
}

@TauriPlugin
class AndroidInstallerPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun getSystemProxy(invoke: Invoke) {
    // 返回 null 表示没有可用的直连代理，调用方会回退到系统网络栈。
    try {
      val manager = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      val proxy = manager?.defaultProxy
      val host = proxy?.host?.trim().orEmpty()
      val port = proxy?.port ?: -1
      if (host.isEmpty() || port !in 1..65535) {
        invoke.resolve()
        return
      }
      invoke.resolve(JSObject().put("host", host).put("port", port))
    } catch (_: Exception) {
      invoke.resolve()
    }
  }

  @Command
  fun install(invoke: Invoke) {
    try {
      val options = invoke.parseArgs(InstallOptions::class.java)
      val updatesRoot = File(activity.cacheDir, "updates").canonicalFile
      val apk = File(options.path).canonicalFile
      val isDirectChild = apk.parentFile == updatesRoot
      if (!isDirectChild || !apk.isFile || !apk.name.endsWith(".apk", ignoreCase = true)) {
        invoke.reject("安装包路径无效，已拒绝启动系统安装器。")
        return
      }

      activity.runOnUiThread {
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
          ) {
            openUnknownSourcesSettings()
            invoke.reject("请允许 HOMURA 安装未知应用，然后返回并再次点“立即安装”。")
            return@runOnUiThread
          }

          val authority = activity.packageName + FILE_PROVIDER_SUFFIX
          val contentUri = FileProvider.getUriForFile(activity, authority, apk)
          val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, APK_MIME_TYPE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          activity.startActivity(intent)
          invoke.resolve()
        } catch (error: ActivityNotFoundException) {
          invoke.reject("系统没有可用的 APK 安装器。")
        } catch (error: Exception) {
          invoke.reject(error.message ?: "无法启动系统安装器。")
        }
      }
    } catch (error: Exception) {
      invoke.reject(error.message ?: "无法读取安装包。")
    }
  }

  private fun openUnknownSourcesSettings() {
    try {
      val settingsIntent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:" + activity.packageName)
      )
      activity.startActivity(settingsIntent)
    } catch (_: ActivityNotFoundException) {
      activity.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
    }
  }
}
