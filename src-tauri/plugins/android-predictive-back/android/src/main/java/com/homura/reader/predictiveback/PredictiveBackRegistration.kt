package com.homura.reader.predictiveback

import android.app.Activity
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedDispatcher

@android.annotation.TargetApi(34)
object PredictiveBackRegistration {
  fun register(
    activity: Activity,
    dispatch: (String, Float, Int, Float, Float, Long) -> Unit
  ): OnBackAnimationCallback {
    val callback = object : OnBackAnimationCallback {
      override fun onBackStarted(backEvent: BackEvent) {
        dispatchEvent("started", backEvent, dispatch)
      }

      override fun onBackProgressed(backEvent: BackEvent) {
        dispatchEvent("progressed", backEvent, dispatch)
      }

      override fun onBackCancelled() {
        dispatch("cancelled", Float.NaN, -1, Float.NaN, Float.NaN, 0)
      }

      override fun onBackInvoked() {
        dispatch("invoked", Float.NaN, -1, Float.NaN, Float.NaN, 0)
      }
    }

    activity.window.onBackInvokedDispatcher.registerOnBackInvokedCallback(
      OnBackInvokedDispatcher.PRIORITY_DEFAULT,
      callback
    )
    return callback
  }

  fun unregister(activity: Activity, callback: Any) {
    activity.window.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(
      callback as OnBackAnimationCallback
    )
  }

  private fun dispatchEvent(
    phase: String,
    event: BackEvent,
    dispatch: (String, Float, Int, Float, Float, Long) -> Unit
  ) {
    dispatch(
      phase,
      event.progress,
      event.swipeEdge,
      event.touchX,
      event.touchY,
      event.frameTimeMillis
    )
  }
}
