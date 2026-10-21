mod audio;
mod bookmarks;
mod collections;
mod devices;
mod library;
mod mpv;
mod recent;
mod sample;
mod settings;
mod thumbnail;
mod video;

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

/// 把上次的窗口大小与位置还回去。
///
/// 尺寸与坐标都按**物理像素**存：`inner_size` / `outer_position` 拿到的就是物理值，
/// 按逻辑值还原会在不同缩放的显示器上跑偏。
fn restore_window(window: &tauri::WebviewWindow, stored: &settings::Settings) {
  if let (Some(width), Some(height)) = (stored.window_width, stored.window_height) {
    let _ = window.set_size(tauri::PhysicalSize::new(width, height));
  }

  if let (Some(x), Some(y)) = (stored.window_x, stored.window_y) {
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
  }
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

      /*
       * yt-dlp 是可选的：装了就用，没装也不影响本地播放。
       *
       * 发布版从 Resource 目录拿；`tauri dev` 下 Resource 指向 target/debug，
       * 那份不在那儿，所以再兜一个仓库里的 binaries 目录——否则开发时永远测不到内置的那份。
       */
      let bundled_ytdlp = app
        .path()
        .resolve("binaries/yt-dlp/yt-dlp.exe", tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|path| path.is_file())
        .or_else(|| {
          let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/yt-dlp/yt-dlp.exe");

          dev.is_file().then_some(dev)
        });

      if let Some(bundled) = bundled_ytdlp {
        mpv::set_bundled_ytdlp(bundled);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 上次开着置顶就接着置顶；迷你模式由前端自己铺（它还要跟着换界面布局）
      if let Some(window) = app.get_webview_window("main") {
        let stored = settings::load(&settings::config_dir(app.handle()));
        let _ = window.set_always_on_top(stored.always_on_top);

        // 迷你模式下的尺寸是临时的，不往「常用尺寸」上还原
        if !stored.mini_mode {
          restore_window(&window, &stored);
        }
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
      mpv::play_capture_device,
      mpv::player_state,
      mpv::player_details,
      mpv::audio_devices,
      mpv::toggle_pause,
      mpv::pause_video,
      mpv::seek_to,
      mpv::seek_by,
      mpv::step_frame,
      mpv::chapters,
      mpv::select_chapter,
      mpv::ab_loop,
      mpv::set_loop_a,
      mpv::set_loop_b,
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
      mpv::video_options,
      mpv::play_options,
      mpv::set_play_mode,
      mpv::set_hwdec,
      mpv::set_video_filter_mode,
      mpv::set_video_aspect,
      mpv::set_video_fill,
      mpv::set_video_zoom,
      mpv::set_video_rotate,
      mpv::set_video_flip,
      mpv::set_video_color,
      mpv::set_video_switch,
      mpv::set_video_sharpen,
      mpv::set_video_profile,
      mpv::set_video_tone_mapping,
      mpv::set_video_target_peak,
      mpv::set_video_hdr_recovery,
      mpv::set_screenshot_format,
      mpv::set_screenshot_subtitles,
      mpv::take_screenshot,
      mpv::toggle_fullscreen,
      settings::read_settings,
      settings::write_settings,
      settings::remember_directory,
      settings::remember_always_on_top,
      settings::remember_mini_mode,
      settings::set_shortcut,
      settings::reset_shortcuts,
      settings::set_splash_speed,
      settings::set_theme,
      settings::set_motion,
      sample::prepare_sample_folder,
      collections::read_collections,
      collections::toggle_playlist,
      collections::shift_in_playlist,
      collections::toggle_favorite,
      collections::clear_collection,
      collections::export_collection,
      collections::import_playlist,
      devices::capture_devices,
      bookmarks::read_bookmarks,
      bookmarks::add_bookmark,
      bookmarks::remove_bookmark,
      recent::read_recent,
      recent::clear_recent,
      recent::forget_recent,
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
      // 先把「看到哪儿」记进最近播放，再让内核自己退
      let state = app_handle.state::<mpv::PlayerState>();
      state.remember_progress(&settings::config_dir(app_handle));
      // 音量与倍速也记住：下次启动直接带上，不用每次开机重调
      if let Some((volume, speed)) = state.playback_prefs() {
        let _ = settings::remember_playback(app_handle, volume, speed);
      }
      /*
       * 窗口大小与位置：迷你模式下不存（那是临时尺寸，不是用户挑的）。
       * 最小化时 `outer_position` 会给出 -32000 这种哨兵值，照存会把下次的窗口
       * 放到屏幕外，所以最小化时整条跳过。
       */
      if let Some(window) = app_handle.get_webview_window("main") {
        let stored = settings::load(&settings::config_dir(app_handle));

        if !stored.mini_mode && !window.is_minimized().unwrap_or(false) {
          if let (Ok(size), Ok(position)) = (window.inner_size(), window.outer_position()) {
            let _ = settings::remember_window(
              app_handle,
              size.width,
              size.height,
              position.x,
              position.y,
            );
          }
        }
      }
      // 先让播放内核自己退出：它要趁这个时候把 watch-later（播放位置、
      // 每片的音轨与字幕选择）落盘。直接 kill 掉就什么都留不下。
      state.shutdown();
      // 预览用的是独立 mpv 进程，不主动收掉会在应用退出后残留
      app_handle.state::<thumbnail::ThumbnailState>().shutdown();
    }
  });
}
