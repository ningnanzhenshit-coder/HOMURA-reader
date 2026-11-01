package com.homura.reader.predictiveback

import android.app.Activity
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class EnableOptions {
  lateinit var handler: Channel
}

@TauriPlugin
class PredictiveBackPlugin(private val activity: Activity) : Plugin(activity) {
  private var channel: Channel? = null
  private var callback: Any? = null

  @Command
  fun supported(invoke: Invoke) {
    val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
    invoke.resolve(JSObject().put("supported", supported))
  }

  @Command
  fun enable(invoke: Invoke) {
    try {
      val options = invoke.parseArgs(EnableOptions::class.java)
      channel = options.handler

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        registerCallback()
      }
      invoke.resolve()
    } catch (ex: Exception) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        unregisterCallback()
      }
      channel = null
      invoke.reject(ex.message ?: "Failed to enable predictive back")
    }
  }

  @Command
  fun disable(invoke: Invoke) {
    try {
      unregisterCallback()
      channel = null
      invoke.resolve()
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to disable predictive back")
    }
  }

  @android.annotation.TargetApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
  private fun registerCallback(refresh: Boolean = false) {
    if (callback != null) {
      if (!refresh) return
      unregisterCallback()
    }
    callback = PredictiveBackRegistration.register(activity, ::dispatch)
  }

  @android.annotation.TargetApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
  private fun unregisterCallback() {
    val current = callback ?: return
    PredictiveBackRegistration.unregister(activity, current)
    callback = null
  }

  override fun onResume(activity: AppCompatActivity) {
    super.onResume(activity)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && channel != null) {
      // AndroidX 会在 onResume 重注册普通返回回调，这里重新置顶才能继续消费预见式返回。
      registerCallback(refresh = true)
    }
  }

  private fun dispatch(
    phase: String,
    progress: Float = Float.NaN,
    swipeEdge: Int = -1,
    touchX: Float = Float.NaN,
    touchY: Float = Float.NaN,
    frameTimeMillis: Long = 0
  ) {
    val payload = JSObject().apply {
      put("phase", phase)
      if (!progress.isNaN()) {
        put("progress", progress.toDouble())
        put("swipeEdge", swipeEdge)
        put("touchX", touchX.toDouble())
        put("touchY", touchY.toDouble())
        put("frameTimeMillis", frameTimeMillis)
      }
    }
    channel?.send(payload)
  }
}
