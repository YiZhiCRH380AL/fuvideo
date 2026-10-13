mod audio;
mod collections;
mod library;
mod mpv;
mod sample;
mod settings;
mod thumbnail;

use tauri::Manager;

/// 把主窗口显示出来。
///
/// 主窗口在 `tauri.conf.json` 里是 `visible: false`：窗口先建好、前端把开屏动画的
/// 第一帧画完，再让窗口露面。这样启动时不会先闪一个空窗口，开屏是从第一帧开始的。
#[tauri::command]
fn reveal_window(window: tauri::WebviewWindow) {
  let _ = window.show();
  let _ = window.set_focus();
}

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

      // 兜底：前端要是没能把窗口叫起来（脚本报错、开发服务器没起来），
      // 过一会儿自己显示，别让应用变成「看不见的窗口」。
      let handle = app.handle().clone();
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(3000));

        if let Some(window) = handle.get_webview_window("main") {
          if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
          }
        }
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      reveal_window,
      mpv::probe_mpv,
      mpv::pick_video_file,
      mpv::play_video,
      mpv::stop_video,
      mpv::player_state,
      mpv::player_details,
      mpv::audio_devices,
      mpv::toggle_pause,
      mpv::pause_video,
      mpv::seek_to,
      mpv::seek_by,
      mpv::set_volume,
      mpv::toggle_mute,
      mpv::set_speed,
      mpv::set_audio_track,
      mpv::set_subtitle_track,
      mpv::set_secondary_subtitle,
      mpv::add_subtitle_file,
      mpv::add_audio_file,
      mpv::set_audio_delay,
      mpv::set_subtitle_delay,
      mpv::set_subtitle_font_size,
      mpv::set_subtitle_position,
      mpv::set_subtitle_style_override,
      mpv::set_audio_channels,
      mpv::set_audio_device,
      mpv::set_audio_exclusive,
      mpv::audio_options,
      mpv::set_audio_filter_mode,
      mpv::set_audio_effect,
      mpv::set_equalizer_preset,
      mpv::set_equalizer_band,
      mpv::set_audio_samplerate,
      mpv::set_audio_format,
      mpv::set_audio_spdif,
      mpv::toggle_fullscreen,
      settings::read_settings,
      settings::write_settings,
      sample::prepare_sample_folder,
      collections::read_collections,
      collections::toggle_playlist,
      collections::shift_in_playlist,
      collections::toggle_favorite,
      library::pick_directory,
      library::list_directory,
      library::list_drives,
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
      // 先让播放内核自己退出：它要趁这个时候把 watch-later（播放位置、
      // 每片的音轨与字幕选择）落盘。直接 kill 掉就什么都留不下。
      app_handle.state::<mpv::PlayerState>().shutdown();
      // 预览用的是独立 mpv 进程，不主动收掉会在应用退出后残留
      app_handle.state::<thumbnail::ThumbnailState>().shutdown();
    }
  });
}
