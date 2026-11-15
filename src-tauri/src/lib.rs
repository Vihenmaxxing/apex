// APEX 5.0 — shared entry point for desktop and mobile.
//
// APEX is a self-contained web application. The Rust side exists only to host
// it in a native window, so there are no custom commands, no plugins and no
// network access. All user data stays inside the webview's own storage, which
// the operating system keeps in the application's private data directory.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running APEX");
}
