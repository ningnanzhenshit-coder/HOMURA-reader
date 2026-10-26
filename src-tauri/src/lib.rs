#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
