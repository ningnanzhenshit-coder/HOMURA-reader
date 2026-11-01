const COMMANDS: &[&str] = &["enable", "disable", "supported"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
