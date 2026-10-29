use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowEvent};

// 全屏退出（macOS 的 Space 切换动画、Windows 的窗口样式重设）会让 WebView 丢掉键盘焦点，
// 导致 F 键失灵。这里用一个常驻工作线程监听窗口尺寸变化：每次「全屏 → 窗口」后持续 2s
// 把焦点塞回 WebView。状态是逐帧采样的，连续快速切换也不会漏掉过渡。
fn spawn_focus_worker(window: tauri::WebviewWindow) {
    let (tx, rx) = mpsc::channel::<()>();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_)) {
            let _ = tx.send(());
        }
    });

    std::thread::spawn(move || {
        let mut was_fullscreen = window.is_fullscreen().unwrap_or(false);
        let mut focus_until: Option<Instant> = None;
        let mut window_focus_until: Option<Instant> = None;

        loop {
            if focus_until.is_some() {
                // 恢复期内按 100ms 采样，顺便吞掉这期间的事件
                std::thread::sleep(Duration::from_millis(100));
                while rx.try_recv().is_ok() {}
            } else {
                match rx.recv() {
                    Ok(()) => {}
                    Err(_) => return,
                }
                // 合并短时间内的连续 resize 事件，等系统把全屏状态落定
                std::thread::sleep(Duration::from_millis(80));
                while rx.try_recv().is_ok() {}
            }

            let now_fullscreen = window.is_fullscreen().unwrap_or(false);
            if now_fullscreen != was_fullscreen {
                was_fullscreen = now_fullscreen;
                if now_fullscreen {
                    // 重新进入全屏，取消尚未完成的恢复
                    focus_until = None;
                    window_focus_until = None;
                } else {
                    // macOS 退出全屏约 0.6s 后才真正丢键盘焦点，守 2s 覆盖整个过渡；
                    // 窗口本身失焦的情况只在前 1s 尝试抢回，避免用户切走后还硬抢
                    focus_until = Some(Instant::now() + Duration::from_secs(2));
                    window_focus_until = Some(Instant::now() + Duration::from_secs(1));
                }
            }

            let Some(until) = focus_until else { continue };

            if !window.is_focused().unwrap_or(true)
                && window_focus_until.is_some_and(|deadline| Instant::now() < deadline)
            {
                let _ = window.set_focus();
            }

            // webview.set_focus 只影响本窗口内部的键盘焦点，不会抢别的 App
            // （macOS 走 makeFirstResponder，Windows 走 MoveFocus），否则按 F 没反应
            let webview: &tauri::Webview = window.as_ref();
            if webview.set_focus().is_err() {
                focus_until = None;
                window_focus_until = None;
                continue;
            }

            if Instant::now() >= until {
                focus_until = None;
                window_focus_until = None;
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                spawn_focus_worker(window);
            }
            Ok(())
        })
        // 窗口在配置里以不可见状态创建，等页面首帧渲染完成后再显示，避免启动时先黑屏
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                if let Err(err) = webview.window().show() {
                    eprintln!("显示主窗口失败: {err}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running HOMURA");
}
