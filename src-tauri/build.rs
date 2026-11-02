fn main() {
    // 图标更新也要重编译 Windows 资源，避免只更新页面图标、EXE 仍沿用旧缓存。
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
