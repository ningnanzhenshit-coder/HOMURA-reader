package com.homura.reader.systembars

import android.app.Activity
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class SystemBarsOptions {
  var dark: Boolean = false
}

@TauriPlugin
class AndroidSystemBarsPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun setAppearance(invoke: Invoke) {
    try {
      val options = invoke.parseArgs(SystemBarsOptions::class.java)
      activity.runOnUiThread {
        val window = activity.window
        if (window == null) {
          invoke.reject("Android window unavailable")
          return@runOnUiThread
        }
        // enableEdgeToEdge 已让系统栏透明，这里只负责切图标明暗，避免夜间深色底上压黑图标。
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !options.dark
        controller.isAppearanceLightNavigationBars = !options.dark
        invoke.resolve()
      }
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to update Android system bars")
    }
  }
}
