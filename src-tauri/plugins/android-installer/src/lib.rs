use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
#[derive(Debug, serde::Deserialize)]
pub struct SystemProxy {
    pub host: String,
    pub port: u16,
}

#[cfg(target_os = "android")]
pub struct AndroidInstaller<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
impl<R: Runtime> AndroidInstaller<R> {
    pub fn system_proxy(&self) -> Result<Option<SystemProxy>, String> {
        self.0
            .run_mobile_plugin::<Option<SystemProxy>>("getSystemProxy", ())
            .map_err(|error| error.to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-installer")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin(
                    "com.homura.reader.installer",
                    "AndroidInstallerPlugin",
                )?;
                _app.manage(AndroidInstaller::<R>(handle));
            }

            #[cfg(not(target_os = "android"))]
            let _ = api;

            Ok(())
        })
        .build()
}
