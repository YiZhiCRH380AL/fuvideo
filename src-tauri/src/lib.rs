mod library;
mod mpv;
mod thumbnail;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .manage(mpv::PlayerState::default())
    .manage(thumbnail::ThumbnailState::default())
    .setup(|app| {
      // 安装包里自带 mpv 的话优先用它，用户不用再单独装
      if let Ok(bundled) = app
        .path()
        .resolve("binaries/mpv/mpv.exe", tauri::path::BaseDirectory::Resource)
      {
        mpv::set_bundled_mpv(bundled);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      mpv::probe_mpv,
      mpv::pick_video_file,
      mpv::play_video,
      mpv::stop_video,
      mpv::player_state,
      mpv::toggle_pause,
      mpv::seek_to,
      mpv::seek_by,
      mpv::set_volume,
      mpv::toggle_mute,
      mpv::set_speed,
      mpv::toggle_fullscreen,
      library::pick_directory,
      library::list_directory,
      thumbnail::thumbnail_at,
    ])
    .on_window_event(|window, event| {
      // 主窗口尺寸变化（含全屏切换）时，让嵌入的 mpv 子窗口跟着变
      if matches!(event, tauri::WindowEvent::Resized(_)) {
        if let Ok(size) = window.inner_size() {
          let state = window.app_handle().state::<mpv::PlayerState>();
          mpv::resize_embedded(&state, size.width, size.height);
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      // 预览用的是独立 mpv 进程，不主动收掉会在应用退出后残留
      app_handle.state::<thumbnail::ThumbnailState>().shutdown();
    }
  });
}
