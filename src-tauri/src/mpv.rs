//! mpv 播放内核的探测与进程管理。
//!
//! M0 的验证目标是打通「HTML 界面 + mpv 渲染」这条链路：mpv 作为子进程启动，
//! 通过 `--wid` 嵌入主窗口，并把自己创建的窗口压到 z-order 底部，让透明的
//! WebView 界面浮在画面之上。

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;

pub(crate) mod ipc;

/// 允许通过环境变量指定 mpv 可执行文件，便于开发时指向自备的解压版 mpv。
pub const MPV_PATH_ENV: &str = "FUVIDEO_MPV_PATH";

/// 每次播放用一个全新的管道名。
///
/// 固定名字会踩坑：上一次的 mpv 还没完全退出时管道依然存在，
/// 新的 mpv 建同名管道会失败，而我们可能连到那个正在消失的旧连接上。
static IPC_SEQUENCE: AtomicU64 = AtomicU64::new(1);

/// 生成一个带用途标签的唯一管道名。播放器与缩略图两个实例各用各的。
pub(crate) fn next_pipe_name(label: &str) -> String {
  let sequence = IPC_SEQUENCE.fetch_add(1, Ordering::SeqCst);
  format!(r"\\.\pipe\fuvideo-{label}-{}-{sequence}", std::process::id())
}

/// PATH 里找不到时兜底的常见安装位置。注意这里是**完整可执行文件路径**，不是目录。
const MPV_FILE_CANDIDATES: &[&str] = &[
  r"C:\Program Files\MPV Player\mpv.exe",
  r"C:\Program Files\mpv\mpv.exe",
  r"C:\Program Files (x86)\mpv\mpv.exe",
  r"C:\Program Files\mpv.net\mpv.exe",
  r"C:\mpv\mpv.exe",
];

const MPV_EXECUTABLE: &str = "mpv.exe";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvProbe {
  pub available: bool,
  pub version: Option<String>,
  pub path: Option<String>,
}

#[derive(Default)]
pub struct PlayerState {
  child: Mutex<Option<Child>>,
  ipc: Mutex<Option<ipc::MpvIpc>>,
  current_path: Mutex<Option<String>>,
  child_window: Mutex<Option<isize>>,
  ipc_pipe: Mutex<Option<String>>,
}

impl PlayerState {
  /// 换上一个新的播放进程，同时结束上一个，保证同一时间只跑一个 mpv。
  fn replace(&self, child: Child, path: String, pipe: String) {
    {
      let mut slot = self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

      if let Some(mut previous) = slot.take() {
        let _ = previous.kill();
        let _ = previous.wait();
      }

      *slot = Some(child);
    }

    // 换了进程，旧连接就作废了，交给 ensure_ipc 重新建立
    *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.current_path.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(path);
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.ipc_pipe.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pipe);
  }

  /// 停止当前播放。没有在播放时是空操作。
  fn stop(&self) {
    let mut slot = self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(mut child) = slot.take() {
      let _ = child.kill();
      let _ = child.wait();
    }

    *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.current_path.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.ipc_pipe.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
  }

  fn current_path(&self) -> Option<String> {
    self
      .current_path
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
      .clone()
  }

  fn child_window(&self) -> Option<isize> {
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
  }

  fn set_child_window(&self, handle: Option<isize>) {
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = handle;
  }

  /// 确保 IPC 已连接。mpv 刚启动时管道可能还没建好，失败就等下一次再试。
  fn ensure_ipc(&self) {
    let mut slot = self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if slot.is_some() {
      return;
    }

    let pipe = self
      .ipc_pipe
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
      .clone();

    if let Some(pipe) = pipe {
      if let Ok(client) = ipc::MpvIpc::connect(&pipe) {
        *slot = Some(client);
      }
    }
  }

  /// IPC 是否已经连上，让界面能区分「没在播放」和「连不上播放内核」。
  fn ipc_ready(&self) -> bool {
    self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).is_some()
  }

  /// 借出 IPC 连接执行一次操作。连接层面出错时丢弃连接，下次自动重连。
  fn with_ipc<T>(&self, action: impl FnOnce(&ipc::MpvIpc) -> Result<T, ipc::IpcError>) -> Result<T, String> {
    self.ensure_ipc();

    let outcome = {
      let guard = self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

      match guard.as_ref() {
        Some(client) => action(client),
        None => return Err("播放内核尚未就绪".to_string()),
      }
    };

    match outcome {
      Ok(value) => Ok(value),
      Err(ipc::IpcError::Rejected(reason)) => Err(reason),
      Err(other) => {
        *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
        Err(other.to_string())
      }
    }
  }
}

/// 从 `mpv --version` 的输出里取出纯版本号，例如 `0.40.0`。
pub fn parse_version(stdout: &str) -> Option<String> {
  let first_line = stdout.lines().next()?.trim();

  if first_line.is_empty() {
    return None;
  }

  match first_line.split_whitespace().nth(1) {
    Some(version) => Some(version.to_string()),
    None => Some(first_line.to_string()),
  }
}

/// 在给定目录列表里查找可执行文件。抽出来是为了能脱离真实环境做测试。
pub fn find_in_dirs<I>(executable: &str, dirs: I) -> Option<PathBuf>
where
  I: IntoIterator<Item = PathBuf>,
{
  dirs
    .into_iter()
    .map(|dir| dir.join(executable))
    .find(|candidate| candidate.is_file())
}

/// 在给定的候选文件路径里挑出第一个真实存在的。
pub fn find_first_file<I>(files: I) -> Option<PathBuf>
where
  I: IntoIterator<Item = PathBuf>,
{
  files.into_iter().find(|candidate| candidate.is_file())
}

/// 在 PATH 中查找 mpv。
pub fn find_in_path(executable: &str) -> Option<PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  find_in_dirs(executable, std::env::split_paths(&path_var))
}

/// 定位 mpv 可执行文件：环境变量 > PATH > 常见安装目录。
pub fn find_mpv() -> Option<PathBuf> {
  if let Some(custom) = std::env::var_os(MPV_PATH_ENV) {
    let candidate = PathBuf::from(custom);

    if candidate.is_file() {
      return Some(candidate);
    }
  }

  find_in_path(MPV_EXECUTABLE).or_else(|| find_first_file(MPV_FILE_CANDIDATES.iter().map(PathBuf::from)))
}

/// 探测指定路径的 mpv，`None` 表示没找到可执行文件。
pub fn probe_at(executable: Option<&Path>) -> MpvProbe {
  let Some(executable) = executable else {
    return MpvProbe {
      available: false,
      version: None,
      path: None,
    };
  };

  MpvProbe {
    available: true,
    version: read_version(executable),
    path: Some(executable.to_string_lossy().to_string()),
  }
}

fn read_version(executable: &Path) -> Option<String> {
  let mut command = Command::new(executable);
  command.arg("--version").stdout(Stdio::piped()).stderr(Stdio::null());

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  let output = command.output().ok()?;
  parse_version(&String::from_utf8_lossy(&output.stdout))
}

/// 组装启动 mpv 的命令行参数。嵌进 `window_handle` 指定的窗口，并关掉 mpv 自己的界面。
pub fn build_play_args(window_handle: isize, pipe_path: &str, path: &str) -> Vec<String> {
  vec![
    format!("--wid={window_handle}"),
    format!("--input-ipc-server={pipe_path}"),
    "--no-border".to_string(),
    "--force-window=yes".to_string(),
    "--keep-open=no".to_string(),
    "--hwdec=auto-safe".to_string(),
    "--osc=no".to_string(),
    "--input-default-bindings=no".to_string(),
    "--no-terminal".to_string(),
    path.to_string(),
  ]
}

#[cfg(windows)]
pub(crate) const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/* ---------------- Windows 子窗口处理 ---------------- */

#[cfg(windows)]
mod win {
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
  };

  /// 枚举某个窗口的直接与间接子窗口句柄。
  pub fn child_windows(parent: isize) -> Vec<isize> {
    let mut found: Vec<isize> = Vec::new();

    unsafe {
      let _ = EnumChildWindows(
        Some(HWND(parent as *mut _)),
        Some(collect_child),
        LPARAM(&mut found as *mut Vec<isize> as isize),
      );
    }

    found
  }

  unsafe extern "system" fn collect_child(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    // SAFETY: 调用方（child_windows）传入的是一个仍然存活的可变引用地址。
    unsafe {
      let list = &mut *(lparam.0 as *mut Vec<isize>);
      list.push(hwnd.0 as isize);
    }
    windows::core::BOOL(1)
  }

  /// 把窗口压到同级的最底层，让透明的 WebView 界面浮在视频之上。
  pub fn send_to_bottom(hwnd: isize) {
    unsafe {
      let _ = SetWindowPos(
        HWND(hwnd as *mut _),
        Some(HWND_BOTTOM),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
      );
    }
  }

  /// 让嵌入的 mpv 子窗口跟上主窗口的尺寸。
  pub fn resize(hwnd: isize, width: i32, height: i32) {
    unsafe {
      let _ = SetWindowPos(
        HWND(hwnd as *mut _),
        None,
        0,
        0,
        width,
        height,
        SWP_NOACTIVATE | SWP_NOZORDER,
      );
    }
  }
}

#[cfg(not(windows))]
mod win {
  pub fn child_windows(_parent: isize) -> Vec<isize> {
    Vec::new()
  }

  pub fn send_to_bottom(_hwnd: isize) {}

  pub fn resize(_hwnd: isize, _width: i32, _height: i32) {}
}

/// 主窗口尺寸变化时，让嵌入的 mpv 子窗口跟着一起变。
pub fn resize_embedded(state: &PlayerState, width: u32, height: u32) {
  if let Some(handle) = state.child_window() {
    win::resize(handle, width as i32, height as i32);
  }
}

/* ---------------- Tauri 命令 ---------------- */

/// 查询本机是否具备可用的 mpv 播放内核。
#[tauri::command]
pub fn probe_mpv() -> MpvProbe {
  probe_at(find_mpv().as_deref())
}

/// 弹出系统文件选择框，返回选中的视频路径；用户取消时返回 `None`。
#[tauri::command(async)]
pub fn pick_video_file() -> Result<Option<String>, String> {
  let picked = rfd::FileDialog::new()
    .set_title("选择视频")
    .add_filter(
      "视频文件",
      &[
        "mp4", "mkv", "mov", "avi", "webm", "flv", "ts", "m2ts", "wmv", "m4v", "mpg", "mpeg", "rmvb", "3gp", "ogv",
      ],
    )
    .add_filter("全部文件", &["*"])
    .pick_file();

  Ok(picked.map(|path| path.to_string_lossy().to_string()))
}

/// 用 mpv 播放指定视频，并把画面嵌进主窗口。
#[tauri::command(async)]
pub fn play_video(
  window: tauri::WebviewWindow,
  state: tauri::State<'_, PlayerState>,
  path: String,
) -> Result<(), String> {
  let executable = find_mpv().ok_or_else(|| "未找到 mpv，请先安装 mpv 后重试".to_string())?;
  let window_handle = window.hwnd().map_err(|error| format!("获取窗口句柄失败: {error}"))?.0 as isize;
  let pipe = next_pipe_name("mpv");

  // mpv 建窗是异步的，先记录已有子窗口，启动后对比出 mpv 新建的那个。
  let before = win::child_windows(window_handle);

  let mut command = Command::new(&executable);
  command.args(build_play_args(window_handle, &pipe, &path));

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  let child = command
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|error| format!("启动 mpv 失败: {error}"))?;

  state.replace(child, path, pipe);

  // mpv 建窗是异步的，轮询找出它新建的那个子窗口。
  let mut embedded = None;

  for _ in 0..20 {
    std::thread::sleep(Duration::from_millis(100));

    if let Some(handle) = win::child_windows(window_handle)
      .into_iter()
      .find(|handle| !before.contains(handle))
    {
      embedded = Some(handle);
      break;
    }
  }

  if let Some(handle) = embedded {
    // 对齐当前窗口尺寸，再压到底层，让透明的 WebView 界面浮在画面之上
    if let Ok(size) = window.inner_size() {
      win::resize(handle, size.width as i32, size.height as i32);
    }

    win::send_to_bottom(handle);
  }

  state.set_child_window(embedded);

  Ok(())
}

/// 停止当前播放。
#[tauri::command(async)]
pub fn stop_video(
  state: tauri::State<'_, PlayerState>,
) {
  state.stop();
}

/// 送回给前端的播放状态快照。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
  pub has_media: bool,
  pub ipc_ready: bool,
  pub path: Option<String>,
  pub position: f64,
  pub duration: f64,
  pub paused: bool,
  pub volume: f64,
  pub muted: bool,
  pub speed: f64,
  pub buffering: bool,
}

/// mpv 的默认音量与倍速，用作属性尚未就绪时的兜底。
const DEFAULT_VOLUME: f64 = 100.0;
const DEFAULT_SPEED: f64 = 1.0;

fn idle_snapshot() -> PlayerSnapshot {
  PlayerSnapshot {
    has_media: false,
    ipc_ready: false,
    path: None,
    position: 0.0,
    duration: 0.0,
    paused: true,
    volume: DEFAULT_VOLUME,
    muted: false,
    speed: DEFAULT_SPEED,
    buffering: false,
  }
}

/// 读取当前播放位置、总时长与暂停状态，供界面轮询。
#[tauri::command(async)]
pub fn player_state(state: tauri::State<'_, PlayerState>) -> PlayerSnapshot {
  let Some(path) = state.current_path() else {
    return idle_snapshot();
  };

  PlayerSnapshot {
    has_media: true,
    // 放在最后取，让前面几次调用有机会把连接懒建立起来
    ipc_ready: state.ipc_ready(),
    path: Some(path),
    position: state.with_ipc(|client| client.get_number("time-pos")).ok().flatten().unwrap_or(0.0),
    duration: state.with_ipc(|client| client.get_number("duration")).ok().flatten().unwrap_or(0.0),
    paused: state.with_ipc(|client| client.get_bool("pause")).ok().flatten().unwrap_or(false),
    volume: state
      .with_ipc(|client| client.get_number("volume"))
      .ok()
      .flatten()
      .unwrap_or(DEFAULT_VOLUME),
    muted: state.with_ipc(|client| client.get_bool("mute")).ok().flatten().unwrap_or(false),
    speed: state
      .with_ipc(|client| client.get_number("speed"))
      .ok()
      .flatten()
      .unwrap_or(DEFAULT_SPEED),
    buffering: state
      .with_ipc(|client| client.get_bool("paused-for-cache"))
      .ok()
      .flatten()
      .unwrap_or(false),
  }
}

/// 在播放与暂停之间切换，返回切换后的状态。
#[tauri::command(async)]
pub fn toggle_pause(state: tauri::State<'_, PlayerState>) -> Result<bool, String> {
  let paused = state.with_ipc(|client| client.get_bool("pause"))?.unwrap_or(false);
  let next = !paused;

  state.with_ipc(|client| client.set_flag("pause", next))?;

  Ok(next)
}

/// 跳转到指定秒数。
#[tauri::command(async)]
pub fn seek_to(state: tauri::State<'_, PlayerState>, position: f64) -> Result<(), String> {
  state.with_ipc(|client| client.seek_absolute(position))
}

/// 相对当前位置前后跳转，秒数为正表示前进。
#[tauri::command(async)]
pub fn seek_by(state: tauri::State<'_, PlayerState>, offset: f64) -> Result<(), String> {
  state.with_ipc(|client| client.seek_relative(offset))
}

/// 设置音量，范围限制在 mpv 允许的 0-150 之间。
#[tauri::command(async)]
pub fn set_volume(state: tauri::State<'_, PlayerState>, volume: f64) -> Result<(), String> {
  state.with_ipc(|client| client.set_number("volume", volume.clamp(0.0, 150.0)))
}

/// 静音开关，返回切换后的静音状态。
#[tauri::command(async)]
pub fn toggle_mute(state: tauri::State<'_, PlayerState>) -> Result<bool, String> {
  let muted = state.with_ipc(|client| client.get_bool("mute"))?.unwrap_or(false);
  let next = !muted;

  state.with_ipc(|client| client.set_flag("mute", next))?;

  Ok(next)
}

/// 设置播放倍速。
#[tauri::command(async)]
pub fn set_speed(state: tauri::State<'_, PlayerState>, speed: f64) -> Result<(), String> {
  state.with_ipc(|client| client.set_number("speed", speed.clamp(0.25, 4.0)))
}

/// 切换全屏，返回切换后的全屏状态。
#[tauri::command(async)]
pub fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
  let next = !window.is_fullscreen().map_err(|error| error.to_string())?;

  window.set_fullscreen(next).map_err(|error| error.to_string())?;

  Ok(next)
}

#[cfg(test)]
mod tests {
  use std::thread;
  use std::time::Instant;

  use super::*;

  #[test]
  fn parse_version_extracts_number() {
    let stdout = "mpv 0.40.0 Copyright © 2000-2025 mpv/MPlayer/mplayer2 projects\n built on ...\n";
    assert_eq!(parse_version(stdout), Some("0.40.0".to_string()));
  }

  #[test]
  fn parse_version_handles_unexpected_output() {
    assert_eq!(parse_version(""), None);
    assert_eq!(parse_version("mpv"), Some("mpv".to_string()));
  }

  #[test]
  fn find_in_dirs_returns_first_existing_match() {
    let root = std::env::temp_dir().join("fuvideo-find-in-dirs");
    let hit = root.join("hit");
    let miss = root.join("miss");
    std::fs::create_dir_all(&hit).expect("create hit dir");
    std::fs::create_dir_all(&miss).expect("create miss dir");
    std::fs::write(hit.join(MPV_EXECUTABLE), b"stub").expect("write stub");

    let found = find_in_dirs(MPV_EXECUTABLE, vec![miss.clone(), hit.clone()]);

    assert_eq!(found, Some(hit.join(MPV_EXECUTABLE)));
    assert_eq!(find_in_dirs("nope.exe", vec![hit.clone()]), None);

    let _ = std::fs::remove_dir_all(&root);
  }

  #[test]
  fn probe_at_reports_missing_executable() {
    let probe = probe_at(None);

    assert!(!probe.available);
    assert_eq!(probe.version, None);
    assert_eq!(probe.path, None);
  }

  #[test]
  fn build_play_args_embeds_window_and_disables_mpv_ui() {
    let args = build_play_args(4242, r"\\.\pipe\fuvideo-test", r"E:\clips\sample.mkv");

    assert!(args.contains(&"--wid=4242".to_string()));
    assert!(args.contains(&r"--input-ipc-server=\\.\pipe\fuvideo-test".to_string()));
    assert!(args.contains(&"--osc=no".to_string()));
    assert!(args.contains(&"--hwdec=auto-safe".to_string()));
    assert_eq!(args.last(), Some(&r"E:\clips\sample.mkv".to_string()));
  }

  #[test]
  fn pipe_names_are_unique_per_playback() {
    // 固定管道名会在连续打开文件时跟上一个 mpv 抢管道，必须每次都不一样
    let first = next_pipe_name("mpv");
    let second = next_pipe_name("mpv");

    assert_ne!(first, second);
    assert!(first.starts_with(r"\\.\pipe\fuvideo-mpv-"));
  }

  /// 前端按 camelCase 读取字段，字段名一旦对不上，界面会静默拿到 undefined。
  #[test]
  fn snapshot_serializes_camel_case_fields() {
    let snapshot = serde_json::to_value(idle_snapshot()).expect("序列化播放状态");

    for key in [
      "hasMedia",
      "ipcReady",
      "path",
      "position",
      "duration",
      "paused",
      "volume",
      "muted",
      "speed",
      "buffering",
    ] {
      assert!(snapshot.get(key).is_some(), "快照缺少字段 {key}");
    }
  }

  #[test]
  fn probe_serializes_expected_fields() {
    let probe = serde_json::to_value(probe_at(None)).expect("序列化探测结果");

    assert!(probe.get("available").is_some());
    assert!(probe.get("version").is_some());
    assert!(probe.get("path").is_some());
  }

  #[test]
  fn candidate_list_holds_full_executable_paths() {
    // 这里存的是完整 exe 路径。曾经把它当成目录再 join 一次文件名，
    // 结果去找 "...\MPV Player\mpv.exe\mpv.exe"，导致探测永远失败。
    assert!(MPV_FILE_CANDIDATES.contains(&r"C:\Program Files\MPV Player\mpv.exe"));
    assert!(MPV_FILE_CANDIDATES.iter().all(|candidate| candidate.ends_with("mpv.exe")));
  }

  #[test]
  fn find_first_file_skips_missing_entries() {
    let missing = std::env::temp_dir().join("fuvideo-definitely-missing").join("mpv.exe");
    let existing = std::env::temp_dir().join("fuvideo-existing-mpv.exe");
    std::fs::write(&existing, b"stub").expect("write stub");

    assert_eq!(find_first_file(vec![missing, existing.clone()]), Some(existing.clone()));

    let _ = std::fs::remove_file(&existing);
  }

  #[test]
  fn finds_mpv_at_default_install_location() {
    // 装有默认位置 mpv 时必须真正生效，不能静默跳过——
    // 否则探测逻辑回归了也看不出来。
    let known = PathBuf::from(r"C:\Program Files\MPV Player\mpv.exe");

    if !known.is_file() {
      eprintln!("本机没有默认安装位置的 mpv，跳过");
      return;
    }

    assert_eq!(find_mpv().as_deref(), Some(known.as_path()));

    let probe = probe_at(Some(&known));
    assert!(probe.available);
    assert!(probe.version.is_some(), "应能从 mpv --version 解析出版本号");
  }

  fn connect_until_ready(pipe: &str, timeout: Duration) -> ipc::MpvIpc {
    let deadline = Instant::now() + timeout;
    let mut last_error = String::new();

    while Instant::now() < deadline {
      match ipc::MpvIpc::connect(pipe) {
        Ok(client) => return client,
        Err(error) => last_error = error,
      }

      thread::sleep(Duration::from_millis(200));
    }

    panic!("等不到 mpv 的 IPC 管道 {pipe}: {last_error}");
  }

  fn wait_for_number(client: &ipc::MpvIpc, name: &str, timeout: Duration) -> Option<f64> {
    let deadline = Instant::now() + timeout;

    loop {
      if let Ok(Some(value)) = client.get_number(name) {
        return Some(value);
      }

      if Instant::now() >= deadline {
        return None;
      }

      thread::sleep(Duration::from_millis(100));
    }
  }

  /// 无界面地跑一遍真实 mpv，验证 IPC 能读状态、能暂停、能跳转。
  /// 这条链路是界面控件的地基，坏了必须立刻发现。
  #[test]
  fn ipc_controls_headless_playback() {
    let Some(executable) = find_mpv() else {
      eprintln!("本机未安装 mpv，跳过 IPC 集成测试");
      return;
    };

    let pipe = format!(r"\\.\pipe\fuvideo-test-{}", std::process::id());
    let mut child = Command::new(&executable)
      .args([
        format!("--input-ipc-server={pipe}"),
        "--vo=null".to_string(),
        "--ao=null".to_string(),
        "--no-terminal".to_string(),
        "--no-config".to_string(),
        // 先暂停，避免无渲染时播放速度快到测试读数不稳定
        "--pause=yes".to_string(),
        "av://lavfi:testsrc=duration=4:size=320x240:rate=30".to_string(),
      ])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("启动 mpv 失败");

    let client = connect_until_ready(&pipe, Duration::from_secs(20));

    let duration = wait_for_number(&client, "duration", Duration::from_secs(20)).expect("应能读到总时长");
    assert!(duration > 0.0 && duration.is_finite(), "总时长应当是正数，实际 {duration}");

    assert_eq!(client.get_bool("pause").expect("读暂停状态"), Some(true), "启动时应当是暂停的");

    client.set_flag("pause", false).expect("恢复播放");
    assert_eq!(client.get_bool("pause").expect("读暂停状态"), Some(false));

    client.set_flag("pause", true).expect("再次暂停");
    assert_eq!(client.get_bool("pause").expect("读暂停状态"), Some(true));

    // 暂停状态下跳转，读数才是确定的。目标取时长的一半，避免依赖具体素材长度。
    let target = (duration / 2.0).max(0.1);
    client.seek_absolute(target).expect("跳转");
    let position = wait_for_number(&client, "time-pos", Duration::from_secs(10)).expect("应能读到播放位置");
    assert!(
      (position - target).abs() < 0.3,
      "跳转后位置应约为 {target} 秒，实际 {position}"
    );

    client.set_number("volume", 42.0).expect("设置音量");
    let volume = wait_for_number(&client, "volume", Duration::from_secs(5)).expect("应能读到音量");
    assert!((volume - 42.0).abs() < 1.0, "音量应约为 42，实际 {volume}");

    client.set_flag("mute", true).expect("静音");
    assert_eq!(client.get_bool("mute").expect("读静音状态"), Some(true));

    client.set_number("speed", 1.5).expect("设置倍速");
    let speed = wait_for_number(&client, "speed", Duration::from_secs(5)).expect("应能读到倍速");
    assert!((speed - 1.5).abs() < 0.01, "倍速应为 1.5，实际 {speed}");

    // 本地文件不该处于缓冲等待
    assert_eq!(
      client.get_bool("paused-for-cache").expect("读缓冲状态"),
      Some(false)
    );

    let _ = child.kill();
    let _ = child.wait();
  }
}
