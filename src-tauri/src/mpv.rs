//! mpv 播放内核的探测与进程管理。
//!
//! 结构是「HTML 界面 + mpv 渲染」：mpv 作为子进程启动，通过 `--wid` 嵌入主窗口，
//! 并把自己创建的窗口压到 z-order 底部，让透明的 WebView 界面浮在画面之上。
//!
//! 播放进程是**常驻**的：第一次播放时启动，之后换片一律走 IPC 的 `loadfile`，
//! 不再 kill 再重启。这样音频设备、字幕、画面这些偏好天然跨片保留，换片也不用
//! 重新等启动。退出前发 `quit` 而不是 kill，mpv 才有机会把 watch-later 落盘。

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::audio;
use crate::settings::{self, Settings};

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

/// 等 mpv 建出子窗口的上限。建窗是异步的，只能轮询。
const CHILD_WINDOW_TIMEOUT: Duration = Duration::from_secs(2);
/// 等 IPC 管道出现的上限。冷启动时 mpv 要几十到几百毫秒才把管道建好。
const IPC_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// 等 mpv 自己退出的上限，超过就强杀。收尾不能让应用关不掉。
const QUIT_TIMEOUT: Duration = Duration::from_secs(3);

/// 随安装包一起分发的 mpv。有它就用它，不必要求用户自己装。
static BUNDLED_MPV: OnceLock<PathBuf> = OnceLock::new();

/// 启动时登记安装包自带的 mpv 路径。
pub fn set_bundled_mpv(path: PathBuf) {
  let _ = BUNDLED_MPV.set(path);
}

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
  /// 启动播放进程之前主窗口已经有的子窗口。
  /// mpv 新建的那个就是「不在这个表里」的那一个，换片时可以照这个再找一次。
  window_baseline: Mutex<Vec<isize>>,
}

impl PlayerState {
  /// 结束进程并把状态清干净：句柄、管道、当前文件都不再有效。
  fn clear_process(&self) {
    {
      let mut slot = self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

      if let Some(mut child) = slot.take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }

    *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.current_path.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.ipc_pipe.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.window_baseline.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Vec::new();
  }

  /// 有没有一个还活着的播放进程；顺手把已经退出的那具清掉。
  ///
  /// mpv 有可能自己没了：被外部关掉、崩了，或者我们发过 `stop` 之后它没停在待机。
  /// 这时状态里留着的句柄和管道都不能再用，必须当成「没有进程」处理。
  fn reap_dead_child(&self) -> bool {
    let mut slot = self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    let Some(child) = slot.as_mut() else {
      return false;
    };

    if matches!(child.try_wait(), Ok(None)) {
      return true;
    }

    let _ = child.kill();
    let _ = child.wait();
    *slot = None;
    drop(slot);

    // 进程没了，连接和窗口句柄跟着作废
    *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;

    false
  }

  /// 确保常驻进程已经起来：没有就启动一个，有就直接复用。
  ///
  /// 窗口和管道都是异步就绪的，所以这里既等窗口也等管道。任何一步失败都把
  /// 半成品收干净，免得留下一个连不上的 mpv 让后面每个操作都失败一次。
  fn ensure_process(
    &self,
    executable: &Path,
    window_handle: isize,
    window_size: (u32, u32),
    settings: &Settings,
    config_dir: &Path,
  ) -> Result<(), String> {
    if self.reap_dead_child() {
      return Ok(());
    }

    let pipe = next_pipe_name("mpv");
    // mpv 建窗是异步的，先记录已有子窗口，启动后对比出它新建的那个
    let before = win::child_windows(window_handle);
    *self.window_baseline.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = before.clone();

    let args = build_player_args(window_handle, &pipe, settings, config_dir);
    let child = spawn_player(executable, &args)?;

    prepare_watch_later_dir(settings, config_dir);

    *self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(child);
    *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.current_path.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.child_window.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    *self.ipc_pipe.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pipe.clone());

    self.sync_embedded_window(window_handle, window_size);

    match ipc::connect_with_retry(&pipe, IPC_CONNECT_TIMEOUT) {
      Ok(client) => {
        *self.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(client);
        Ok(())
      }
      Err(error) => {
        self.clear_process();
        Err(error)
      }
    }
  }

  /// 把 mpv 的子窗口对齐到主窗口，并压到底层，让透明的 WebView 界面浮在画面之上。
  ///
  /// 建窗是异步的，而且 mpv 有可能等到第一个文件才建窗（`--idle` 下的行为
  /// 跟版本有关）。所以找不到不是错误，换片之后再叫一次就行——这里返回
  /// 「现在找到没有」，调用方不用关心是第几次。
  fn sync_embedded_window(&self, window_handle: isize, window_size: (u32, u32)) -> Option<isize> {
    let existing = self.child_window();

    let handle = match existing {
      Some(handle) => Some(handle),
      None => {
        let baseline = self
          .window_baseline
          .lock()
          .unwrap_or_else(|poisoned| poisoned.into_inner())
          .clone();
        let found = wait_for_child_window(window_handle, &baseline, CHILD_WINDOW_TIMEOUT);

        if found.is_some() {
          self.set_child_window(found);
        }

        found
      }
    }?;

    win::resize(handle, window_size.0 as i32, window_size.1 as i32);
    win::send_to_bottom(handle);

    Some(handle)
  }

  /// 停止播放但留住进程。没有在播放时是空操作。
  ///
  /// 常驻内核不走 kill：kill 掉下次换片又得等一次启动，而且 mpv 没有机会
  /// 把 watch-later 落盘。
  fn stop(&self) {
    let _ = self.with_ipc(|client| client.stop());
    self.set_current_path(None);
  }

  /// 退出前收尾：先让 mpv 自己退出，它会趁这个机会把 watch-later 落盘；
  /// 超时还不走才强杀。应用退出时调用，别让它挂住。
  pub fn shutdown(&self) {
    if self.reap_dead_child() {
      let _ = self.with_ipc(|client| client.quit());

      let deadline = Instant::now() + QUIT_TIMEOUT;

      while Instant::now() < deadline {
        if !self.reap_dead_child() {
          return;
        }

        std::thread::sleep(Duration::from_millis(50));
      }
    }

    self.clear_process();
  }

  /// 记下当前正在播的文件。
  ///
  /// 换片走的是 IPC 的 `loadfile`，不像以前那样有「新进程」这个天然分界，
  /// 所以当前文件由我们自己维护。
  fn set_current_path(&self, path: Option<String>) {
    *self.current_path.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = path;
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
/// 定位 mpv：安装包自带 > 环境变量 > PATH > 常见安装目录。
pub fn find_mpv_with(bundled: Option<&PathBuf>) -> Option<PathBuf> {
  if let Some(path) = bundled {
    if path.is_file() {
      return Some(path.clone());
    }
  }

  if let Some(custom) = std::env::var_os(MPV_PATH_ENV) {
    let candidate = PathBuf::from(custom);

    if candidate.is_file() {
      return Some(candidate);
    }
  }

  find_in_path(MPV_EXECUTABLE).or_else(|| find_first_file(MPV_FILE_CANDIDATES.iter().map(PathBuf::from)))
}

pub fn find_mpv() -> Option<PathBuf> {
  find_mpv_with(BUNDLED_MPV.get())
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

/// 组装常驻 mpv 的命令行参数：嵌进 `window_handle` 指定的窗口，并关掉 mpv 自己的界面。
///
/// 这里**不带文件名**。进程启动后停在待机状态，第一次播放和之后每一次换片
/// 都走 IPC 的 `loadfile`。
///
/// 设置里凡是 `None` 的项一律不传，让 mpv 用自己的默认值——「没设置过」
/// 和「设成默认值」是两回事，不传才能保证开箱行为不变。
pub fn build_player_args(
  window_handle: isize,
  pipe_path: &str,
  settings: &Settings,
  config_dir: &Path,
) -> Vec<String> {
  let mut args = vec![
    format!("--wid={window_handle}"),
    format!("--input-ipc-server={pipe_path}"),
    "--no-border".to_string(),
    "--force-window=yes".to_string(),
    // 常驻：片子放完停在待机状态，别退出进程
    "--idle=yes".to_string(),
    "--keep-open=no".to_string(),
    format!("--hwdec={}", settings.hwdec),
    "--osc=no".to_string(),
    "--input-default-bindings=no".to_string(),
    "--no-terminal".to_string(),
    // 退出前把播放位置连同这片的音轨、字幕、画面选择一起写进 watch-later
    format!(
      "--save-position-on-quit={}",
      if settings.save_position { "yes" } else { "no" }
    ),
    format!("--watch-later-dir={}", watch_later_dir(config_dir).display()),
  ];

  if let Some(choice) = &settings.sub_auto {
    args.push(format!("--sub-auto={choice}"));
  }

  if let Some(size) = settings.sub_font_size {
    args.push(format!("--sub-font-size={size}"));
  }

  if let Some(choice) = &settings.audio_channels {
    args.push(format!("--audio-channels={choice}"));
  }

  if let Some(device) = &settings.audio_device {
    args.push(format!("--audio-device={device}"));
  }

  if settings.audio_exclusive {
    args.push("--audio-exclusive=yes".to_string());
  }

  if let Some(position) = settings.sub_position {
    args.push(format!("--sub-pos={position}"));
  }

  if let Some(mode) = &settings.sub_ass_override {
    args.push(format!("--sub-ass-override={mode}"));
  }

  if let Some(rate) = settings.audio_samplerate {
    args.push(format!("--audio-samplerate={rate}"));
  }

  if let Some(format) = &settings.audio_format {
    args.push(format!("--audio-format={format}"));
  }

  if settings.audio_spdif {
    args.push(format!("--audio-spdif={}", audio::SPDIF_CODECS));
  }

  args
}

/// watch-later 的存放目录。
///
/// 放在应用配置目录里，不去动用户自己的 `%APPDATA%\mpv`：那里的 watch_later
/// 属于用户手装的 mpv，跟这个应用无关。
pub fn watch_later_dir(config_dir: &Path) -> PathBuf {
  config_dir.join("watch-later")
}

/// 提前把 watch-later 目录建出来。
///
/// mpv 写不进去是**静默失败**的，表现就是「记住播放位置」莫名其妙不生效，
/// 所以目录由我们自己保证存在，不指望 mpv 顺手创建。关掉记住位置就不必建。
fn prepare_watch_later_dir(settings: &Settings, config_dir: &Path) -> Option<PathBuf> {
  if !settings.save_position {
    return None;
  }

  let directory = watch_later_dir(config_dir);

  std::fs::create_dir_all(&directory).ok().map(|()| directory)
}

/// 启动 mpv。参数由调用方决定，测试里可以只换参数不换逻辑。
fn spawn_player(executable: &Path, args: &[String]) -> Result<Child, String> {
  let mut command = Command::new(executable);
  command.args(args);

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  command
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|error| format!("启动 mpv 失败: {error}"))
}

/// 等 mpv 建出子窗口：它会新建一个我们之前没见过的子窗口。
fn wait_for_child_window(parent: isize, before: &[isize], timeout: Duration) -> Option<isize> {
  let deadline = Instant::now() + timeout;

  loop {
    if let Some(handle) = win::child_windows(parent)
      .into_iter()
      .find(|handle| !before.contains(handle))
    {
      return Some(handle);
    }

    if Instant::now() >= deadline {
      return None;
    }

    std::thread::sleep(Duration::from_millis(100));
  }
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

/// 播放指定视频，把画面嵌进主窗口。
///
/// 第一次调用会启动常驻的 mpv 进程，之后每次换片都只是往同一个进程发
/// `loadfile`，所以换片是立刻的，音频设备、字幕这些偏好也留得住。
#[tauri::command(async)]
pub fn play_video(
  app: tauri::AppHandle,
  window: tauri::WebviewWindow,
  state: tauri::State<'_, PlayerState>,
  path: String,
) -> Result<(), String> {
  let executable = find_mpv().ok_or_else(|| "未找到 mpv，请先安装 mpv 后重试".to_string())?;
  let window_handle = window.hwnd().map_err(|error| format!("获取窗口句柄失败: {error}"))?.0 as isize;
  let size = window.inner_size().map_err(|error| format!("读取窗口尺寸失败: {error}"))?;
  let config_dir = settings::config_dir(&app);
  let settings = settings::load(&config_dir);

  state.ensure_process(
    &executable,
    window_handle,
    (size.width, size.height),
    &settings,
    &config_dir,
  )?;

  // 换片之前先把上一个文件的进度和轨道选择写进 watch-later：
  // loadfile 会直接把它丢掉，而 mpv 只在自己退出时才自动写。
  if state.current_path().is_some() {
    let _ = state.with_ipc(|client| client.write_watch_later());
  }

  state.with_ipc(|client| client.load_file(&path))?;
  state.set_current_path(Some(path));

  // 音频效果是全局偏好，但 `af` 也在 watch-later 的默认记录里：不重新压一遍的话，
  // 换到一部以前看过的片子就会带回它当时的那条链，和设置页显示的对不上。
  apply_audio_settings(&state, &settings);

  // 首次播放时 mpv 可能还没把窗口建出来，载入文件后再补一次对齐
  let _ = state.sync_embedded_window(window_handle, (size.width, size.height));

  Ok(())
}

/// 停止当前播放。进程留着，下次换片不用再等启动。
#[tauri::command(async)]
pub fn stop_video(state: tauri::State<'_, PlayerState>) {
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

/* ---------------- 播放详情 ---------------- */

/// 一条轨道。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
  pub id: i64,
  /// `video` / `audio` / `sub`，其余类型原样带出。
  pub kind: String,
  pub title: Option<String>,
  pub lang: Option<String>,
  pub codec: Option<String>,
  pub selected: bool,
  pub external: bool,
  #[serde(rename = "default")]
  pub is_default: bool,
}

/// 播放详情：轨道表，以及当前真正生效的硬解后端。
///
/// 这些是数组型数据。塞进 300ms 一次的高频快照会把轮询拖垮，所以单独开一条
/// 通道，界面按需或低频拉取。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerDetails {
  pub path: Option<String>,
  pub tracks: Vec<TrackInfo>,
  pub hwdec_current: Option<String>,
  /// 第二字幕（双语字幕的第二条）；`None` 表示没开。
  pub secondary_subtitle_id: Option<i64>,
  pub audio_delay: f64,
  pub subtitle_delay: f64,
  pub subtitle_font_size: f64,
  pub subtitle_position: f64,
  /// ASS 字幕的样式覆盖模式：`scale` 跟着文件走，`force` 才会用播放器的字号和位置。
  pub subtitle_style: String,
  pub audio_channels: String,
  pub audio_device: String,
  pub audio_exclusive: bool,
}

/// 这些属性 mpv 有可能读不出来，兜底值取 mpv 自己的默认值。
const DEFAULT_SUB_FONT_SIZE: f64 = 38.0;
const DEFAULT_SUB_POSITION: f64 = 100.0;
const DEFAULT_SUB_STYLE: &str = "scale";
const DEFAULT_AUDIO_CHANNELS: &str = "auto-safe";
const DEFAULT_AUDIO_DEVICE: &str = "auto";

fn idle_details() -> PlayerDetails {
  PlayerDetails {
    path: None,
    tracks: Vec::new(),
    hwdec_current: None,
    secondary_subtitle_id: None,
    audio_delay: 0.0,
    subtitle_delay: 0.0,
    subtitle_font_size: DEFAULT_SUB_FONT_SIZE,
    subtitle_position: DEFAULT_SUB_POSITION,
    subtitle_style: DEFAULT_SUB_STYLE.to_string(),
    audio_channels: DEFAULT_AUDIO_CHANNELS.to_string(),
    audio_device: DEFAULT_AUDIO_DEVICE.to_string(),
    audio_exclusive: false,
  }
}

/// 读一个数值属性；读不到就用兜底值，别把界面卡在 NaN 上。
fn number_or(state: &PlayerState, name: &str, fallback: f64) -> f64 {
  state
    .with_ipc(|client| client.get_number(name))
    .ok()
    .flatten()
    .unwrap_or(fallback)
}

fn text_or(state: &PlayerState, name: &str, fallback: &str) -> String {
  state
    .with_ipc(|client| client.get_string(name))
    .ok()
    .flatten()
    .unwrap_or_else(|| fallback.to_string())
}

/// 把 mpv 的 `track-list` 数组解析成界面用的轨道表。
///
/// 每条轨道的字段都是可选的：外挂字幕没有语言，有些轨道没有 codec，
/// 缺了就留空。但缺 `id` 或 `type` 的那条只能整条丢掉——界面上点不动它。
pub fn parse_tracks(value: &Value) -> Vec<TrackInfo> {
  let Some(items) = value.as_array() else {
    return Vec::new();
  };

  items.iter().filter_map(parse_track).collect()
}

fn parse_track(item: &Value) -> Option<TrackInfo> {
  Some(TrackInfo {
    id: item.get("id")?.as_i64()?,
    kind: item.get("type")?.as_str()?.to_string(),
    title: text_field(item, "title"),
    lang: text_field(item, "lang"),
    codec: text_field(item, "codec"),
    selected: flag_field(item, "selected"),
    external: flag_field(item, "external"),
    is_default: flag_field(item, "default"),
  })
}

fn text_field(item: &Value, key: &str) -> Option<String> {
  item
    .get(key)
    .and_then(Value::as_str)
    .filter(|text| !text.is_empty())
    .map(str::to_string)
}

fn flag_field(item: &Value, key: &str) -> bool {
  item.get(key).and_then(Value::as_bool).unwrap_or(false)
}

/// 读取当前播放的详情。没在播放时返回空表。
#[tauri::command(async)]
pub fn player_details(state: tauri::State<'_, PlayerState>) -> PlayerDetails {
  let Some(path) = state.current_path() else {
    return idle_details();
  };

  PlayerDetails {
    path: Some(path),
    tracks: state
      .with_ipc(|client| client.get_value("track-list"))
      .ok()
      .flatten()
      .map(|value| parse_tracks(&value))
      .unwrap_or_default(),
    hwdec_current: state.with_ipc(|client| client.get_string("hwdec-current")).ok().flatten(),
    secondary_subtitle_id: state
      .with_ipc(|client| client.get_number("secondary-sid"))
      .ok()
      .flatten()
      .map(|id| id as i64),
    audio_delay: number_or(&state, "audio-delay", 0.0),
    subtitle_delay: number_or(&state, "sub-delay", 0.0),
    subtitle_font_size: number_or(&state, "sub-font-size", DEFAULT_SUB_FONT_SIZE),
    subtitle_position: number_or(&state, "sub-pos", DEFAULT_SUB_POSITION),
    subtitle_style: text_or(&state, "sub-ass-override", DEFAULT_SUB_STYLE),
    audio_channels: text_or(&state, "audio-channels", DEFAULT_AUDIO_CHANNELS),
    audio_device: text_or(&state, "audio-device", DEFAULT_AUDIO_DEVICE),
    audio_exclusive: state
      .with_ipc(|client| client.get_bool("audio-exclusive"))
      .ok()
      .flatten()
      .unwrap_or(false),
  }
}

/* ---------------- 音频输出设备 ---------------- */

/// 一个音频输出设备。展示用 `description`，切换时用 `name`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
  pub name: String,
  pub description: String,
}

/// 解析 mpv 的 `audio-device-list`。
///
/// 少了名字的那条只能丢掉——切换时没有名字可用。描述缺失就拿名字顶上，
/// 列表里宁可有条丑的，也不要少一条能用的设备。
pub fn parse_audio_devices(value: &Value) -> Vec<AudioDevice> {
  let Some(items) = value.as_array() else {
    return Vec::new();
  };

  items
    .iter()
    .filter_map(|item| {
      let name = item.get("name").and_then(Value::as_str)?.to_string();
      let description = item
        .get("description")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .unwrap_or(&name)
        .to_string();

      Some(AudioDevice { name, description })
    })
    .collect()
}

/// 列出所有音频输出设备。面板展开时拉一次。
#[tauri::command(async)]
pub fn audio_devices(state: tauri::State<'_, PlayerState>) -> Vec<AudioDevice> {
  state
    .with_ipc(|client| client.get_value("audio-device-list"))
    .ok()
    .flatten()
    .map(|value| parse_audio_devices(&value))
    .unwrap_or_default()
}

/* ---------------- 播放中的音轨、音频输出与字幕 ---------------- */

/// 延迟的允许范围。够用就行，免得手滑传进来的极端值把声音推走。
const DELAY_LIMIT: f64 = 10.0;

/// `--sub-font-size` 的区间，和设置模块保持一致。
const SUB_FONT_SIZE_RANGE: (f64, f64) = (1.0, 9000.0);
/// `--sub-pos` 的区间：0 在顶部，100 是底部。
const SUB_POSITION_RANGE: (f64, f64) = (0.0, 150.0);

/// 把取值夹进区间。NaN 折到最接近 0 的那一端——坏值总比把声音推走 10 秒好。
fn clamp_range(value: f64, min: f64, max: f64) -> f64 {
  if value.is_nan() {
    return min.max(0.0).min(max);
  }

  value.clamp(min, max)
}

fn clamp_delay(seconds: f64) -> f64 {
  clamp_range(seconds, -DELAY_LIMIT, DELAY_LIMIT)
}

/// 改一个设置项并立刻落盘。
///
/// 播放中的改动（输出设备、声道、字号）既要对当前这片生效，也要留给下次启动，
/// 所以是「改 mpv 属性 + 存设置」两步，这里收口第二步。
fn update_settings(
  app: &tauri::AppHandle,
  change: impl FnOnce(&mut Settings),
) -> Result<Settings, String> {
  let directory = settings::config_dir(app);
  let mut current = settings::load(&directory);
  change(&mut current);
  settings::save(&directory, current)
}

/// 切换音轨。`None` 表示关掉音频。
#[tauri::command(async)]
pub fn set_audio_track(state: tauri::State<'_, PlayerState>, id: Option<i64>) -> Result<(), String> {
  state.with_ipc(|client| match id {
    Some(id) => client.select_track("aid", id),
    None => client.set_string("aid", "no"),
  })
}

/// 切换字幕轨道。`None` 表示关闭字幕。
#[tauri::command(async)]
pub fn set_subtitle_track(
  state: tauri::State<'_, PlayerState>,
  id: Option<i64>,
) -> Result<(), String> {
  state.with_ipc(|client| match id {
    Some(id) => client.select_track("sid", id),
    None => client.set_string("sid", "no"),
  })
}

/// 选第二字幕，用来做双语。`None` 表示关掉。
#[tauri::command(async)]
pub fn set_secondary_subtitle(
  state: tauri::State<'_, PlayerState>,
  id: Option<i64>,
) -> Result<(), String> {
  state.with_ipc(|client| match id {
    Some(id) => client.select_track("secondary-sid", id),
    None => client.set_string("secondary-sid", "no"),
  })
}

/// ASS 字幕的样式覆盖。
///
/// 默认的 `scale` 是跟着字幕文件走的：字号、位置这些播放器设置会被 ASS 里写死的
/// 样式盖掉。想让自己调的字号真的生效，得切到 `force`。
#[tauri::command(async)]
pub fn set_subtitle_style_override(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  mode: String,
) -> Result<(), String> {
  if !settings::SUB_ASS_OVERRIDE_MODES.contains(&mode.as_str()) {
    return Err(format!("不支持的字幕样式模式: {mode}"));
  }

  state.with_ipc(|client| client.set_string("sub-ass-override", &mode))?;
  update_settings(&app, |settings| settings.sub_ass_override = Some(mode.clone()))?;

  Ok(())
}

/// 选一个字幕文件挂上去。用户取消时返回 `None`。
#[tauri::command(async)]
pub fn add_subtitle_file(state: tauri::State<'_, PlayerState>) -> Result<Option<String>, String> {
  let picked = rfd::FileDialog::new()
    .set_title("选择字幕")
    .add_filter(
      "字幕文件",
      &["srt", "ass", "ssa", "sub", "vtt", "smi", "idx", "sup", "mks", "lrc", "ttml"],
    )
    .add_filter("全部文件", &["*"])
    .pick_file();

  let Some(path) = picked else {
    return Ok(None);
  };

  let path = path.to_string_lossy().to_string();
  state.with_ipc(|client| client.add_subtitle(&path))?;

  Ok(Some(path))
}

/// 选一个音频文件当外挂音轨。用户取消时返回 `None`。
#[tauri::command(async)]
pub fn add_audio_file(state: tauri::State<'_, PlayerState>) -> Result<Option<String>, String> {
  let picked = rfd::FileDialog::new()
    .set_title("选择音轨")
    .add_filter(
      "音频文件",
      &["aac", "ac3", "eac3", "dts", "flac", "m4a", "mp3", "ogg", "opus", "wav", "wma", "thd"],
    )
    .add_filter("全部文件", &["*"])
    .pick_file();

  let Some(path) = picked else {
    return Ok(None);
  };

  let path = path.to_string_lossy().to_string();
  state.with_ipc(|client| client.add_audio(&path))?;

  Ok(Some(path))
}

/// 音频延迟，正数表示让声音晚一点出来。
#[tauri::command(async)]
pub fn set_audio_delay(state: tauri::State<'_, PlayerState>, seconds: f64) -> Result<(), String> {
  state.with_ipc(|client| client.set_number("audio-delay", clamp_delay(seconds)))
}

/// 字幕延迟，正数表示让字幕晚一点出来。
#[tauri::command(async)]
pub fn set_subtitle_delay(state: tauri::State<'_, PlayerState>, seconds: f64) -> Result<(), String> {
  state.with_ipc(|client| client.set_number("sub-delay", clamp_delay(seconds)))
}

/// 字幕字号。这是全局偏好，下次启动也用它。
#[tauri::command(async)]
pub fn set_subtitle_font_size(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  size: f64,
) -> Result<(), String> {
  let size = clamp_range(size, SUB_FONT_SIZE_RANGE.0, SUB_FONT_SIZE_RANGE.1);

  state.with_ipc(|client| client.set_number("sub-font-size", size))?;
  update_settings(&app, |settings| settings.sub_font_size = Some(size))?;

  Ok(())
}

/// 字幕垂直位置：0 在顶部，100 在底部。同样是全局偏好。
#[tauri::command(async)]
pub fn set_subtitle_position(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  position: f64,
) -> Result<(), String> {
  let position = clamp_range(position, SUB_POSITION_RANGE.0, SUB_POSITION_RANGE.1);

  state.with_ipc(|client| client.set_number("sub-pos", position))?;
  update_settings(&app, |settings| settings.sub_position = Some(position))?;

  Ok(())
}

/// 声道布局。`auto-safe` 是 mpv 的默认值：按文件里的声道来。
#[tauri::command(async)]
pub fn set_audio_channels(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  channels: String,
) -> Result<(), String> {
  state.with_ipc(|client| client.set_string("audio-channels", &channels))?;
  update_settings(&app, |settings| settings.audio_channels = Some(channels.clone()))?;

  Ok(())
}

/// 切换音频输出设备。设备名来自 `audio-device-list`。
///
/// 切换会让 mpv 重建音频管线，中间有一小段断音；设备被独占或被拔掉时
/// mpv 会直接报错，这时错误会原样冒到界面上，而不是静默失败。
#[tauri::command(async)]
pub fn set_audio_device(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  device: String,
) -> Result<(), String> {
  state.with_ipc(|client| client.set_string("audio-device", &device))?;
  update_settings(&app, |settings| settings.audio_device = Some(device.clone()))?;

  Ok(())
}

/// 独占模式。开着会独占设备，别的程序就出不了声，所以界面上要提示清楚。
#[tauri::command(async)]
pub fn set_audio_exclusive(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  enabled: bool,
) -> Result<(), String> {
  state.with_ipc(|client| client.set_flag("audio-exclusive", enabled))?;
  update_settings(&app, |settings| settings.audio_exclusive = enabled)?;

  Ok(())
}

/* ---------------- 音频效果（滤镜链） ---------------- */

/// 把设置里的音频效果同步到正在播放的 mpv 上。
///
/// 失败一律忽略：还没起进程、没在播放的时候这些属性本来就写不进去，
/// 不值得为此让一次「保存设置」整个失败——下次启动照样会用同一份设置。
fn apply_audio_settings(state: &PlayerState, settings: &Settings) {
  let chain = audio::build_filter_chain(settings);

  let _ = state.with_ipc(|client| client.set_audio_filters(&chain));

  let _ = state.with_ipc(|client| {
    client.set_number("audio-samplerate", settings.audio_samplerate.unwrap_or(0) as f64)
  });

  let _ = state.with_ipc(|client| {
    client.set_string("audio-format", settings.audio_format.as_deref().unwrap_or("no"))
  });

  let _ = state.with_ipc(|client| {
    client.set_string(
      "audio-spdif",
      if settings.audio_spdif { audio::SPDIF_CODECS } else { "" },
    )
  });
}

/// 改音频设置并立刻生效。
///
/// 所有音频效果的入口都走这里，免得每个命令自己记一遍「先存哪个、后传哪个」。
/// 返回的是**落盘之后**的那份（越界的取值已经被折回），界面据此更新显示。
fn update_audio_settings(
  app: &tauri::AppHandle,
  state: &PlayerState,
  change: impl FnOnce(&mut Settings),
) -> Result<Settings, String> {
  let directory = settings::config_dir(app);
  let mut current = settings::load(&directory);
  change(&mut current);

  let saved = settings::save(&directory, current)?;
  apply_audio_settings(state, &saved);

  Ok(saved)
}

/// 设置页要用的选项表：频点、预设、位深、采样率。标签由后端给，前端不再抄一份。
#[tauri::command]
pub fn audio_options() -> audio::AudioOptions {
  audio::AudioOptions::default()
}

/// 切换音效的呈现模式（简单 / 高级）。
#[tauri::command(async)]
pub fn set_audio_filter_mode(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  mode: String,
) -> Result<Settings, String> {
  if !settings::AUDIO_FILTER_MODES.contains(&mode.as_str()) {
    return Err(format!("不支持的音效模式: {mode}"));
  }

  update_audio_settings(&app, &state, |settings| settings.audio_filter_mode = mode)
}

/// 开/关简单模式里的一个效果。`kind` 取 `loudness` / `surround` / `widening`。
#[tauri::command(async)]
pub fn set_audio_effect(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  kind: String,
  enabled: bool,
) -> Result<Settings, String> {
  if !["loudness", "surround", "widening"].contains(&kind.as_str()) {
    return Err(format!("未知的音效开关: {kind}"));
  }

  update_audio_settings(&app, &state, |settings| match kind.as_str() {
    "loudness" => settings.loudness_normalization = enabled,
    "surround" => settings.virtual_surround = enabled,
    _ => settings.stereo_widening = enabled,
  })
}

/// 选均衡器预设。`off` 会把所有频段清零。
#[tauri::command(async)]
pub fn set_equalizer_preset(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  preset: String,
) -> Result<Settings, String> {
  let Some(gains) = audio::preset_gains(&preset) else {
    return Err(format!("未知的均衡器预设: {preset}"));
  };

  update_audio_settings(&app, &state, |settings| {
    settings.equalizer_preset = Some(preset);
    settings.equalizer_bands = Some(gains.to_vec());
  })
}

/// 调某一个频段。调过之后预设就落到「自定义」。
#[tauri::command(async)]
pub fn set_equalizer_band(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  index: usize,
  gain: f64,
) -> Result<Settings, String> {
  if index >= settings::EQUALIZER_BANDS {
    return Err(format!("频段序号超出范围: {index}"));
  }

  update_audio_settings(&app, &state, |settings| {
    // 头一次调的时候先按「全平」铺开，用户改的就是他看到的那条曲线
    let mut bands = settings
      .equalizer_bands
      .clone()
      .unwrap_or_else(|| vec![0.0; settings::EQUALIZER_BANDS]);

    bands.resize(settings::EQUALIZER_BANDS, 0.0);
    bands[index] = gain;

    settings.equalizer_bands = Some(bands);
    settings.equalizer_preset = Some("custom".to_string());
  })
}

/// 输出采样率。`None` 表示跟随源。
#[tauri::command(async)]
pub fn set_audio_samplerate(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  samplerate: Option<u32>,
) -> Result<Settings, String> {
  update_audio_settings(&app, &state, |settings| settings.audio_samplerate = samplerate)
}

/// 输出位深。`None` 表示跟随源。
#[tauri::command(async)]
pub fn set_audio_format(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  format: Option<String>,
) -> Result<Settings, String> {
  update_audio_settings(&app, &state, |settings| settings.audio_format = format)
}

/// 音频透传。开着的时候所有滤镜都会失效，界面那边要说清楚。
#[tauri::command(async)]
pub fn set_audio_spdif(
  app: tauri::AppHandle,
  state: tauri::State<'_, PlayerState>,
  enabled: bool,
) -> Result<Settings, String> {
  update_audio_settings(&app, &state, |settings| settings.audio_spdif = enabled)
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
  fn build_player_args_embeds_window_and_keeps_the_process_alive() {
    let config_dir = PathBuf::from(r"E:\config");
    let args = build_player_args(4242, r"\\.\pipe\fuvideo-test", &Settings::default(), &config_dir);

    assert!(args.contains(&"--wid=4242".to_string()));
    assert!(args.contains(&r"--input-ipc-server=\\.\pipe\fuvideo-test".to_string()));
    assert!(args.contains(&"--osc=no".to_string()));
    assert!(args.contains(&"--force-window=yes".to_string()));
    assert!(args.contains(&"--idle=yes".to_string()), "常驻进程要停在待机状态");
    assert!(args.contains(&"--hwdec=auto-safe".to_string()));
    assert!(args.contains(&format!(
      "--watch-later-dir={}",
      watch_later_dir(&config_dir).display()
    )));
    // 换片走 IPC，启动参数里不能再带文件名
    assert!(
      args.iter().all(|arg| arg.starts_with("--")),
      "启动参数里不该出现裸路径: {args:?}"
    );
  }

  /// 没设置过的项一律不传：传了就等于把 mpv 自己的默认值顶掉。
  #[test]
  fn build_player_args_omits_unset_options() {
    let args = build_player_args(1, r"\\.\pipe\p", &Settings::default(), Path::new(r"E:\config"));

    for option in [
      "--sub-auto=",
      "--sub-font-size=",
      "--sub-pos=",
      "--audio-channels=",
      "--audio-device=",
      "--audio-exclusive=",
      "--sub-ass-override=",
    ] {
      assert!(
        !args.iter().any(|arg| arg.starts_with(option)),
        "没设置过的 {option} 不该出现在启动参数里"
      );
    }

    assert!(args.contains(&"--save-position-on-quit=yes".to_string()));
  }

  #[test]
  fn build_player_args_carries_configured_options() {
    let settings = Settings {
      hwdec: "d3d11va".to_string(),
      save_position: false,
      sub_auto: Some("fuzzy".to_string()),
      sub_font_size: Some(48.0),
      audio_channels: Some("stereo".to_string()),
      audio_device: Some("wasapi/{dev}".to_string()),
      audio_exclusive: true,
      sub_position: Some(88.0),
      sub_ass_override: Some("force".to_string()),
      audio_samplerate: Some(48000),
      audio_format: Some("float".to_string()),
      audio_spdif: true,
      audio_filter_mode: "advanced".to_string(),
      loudness_normalization: true,
      virtual_surround: true,
      stereo_widening: true,
      equalizer_preset: Some("music".to_string()),
      equalizer_bands: Some(vec![3.0; settings::EQUALIZER_BANDS]),
    };
    let args = build_player_args(1, r"\\.\pipe\p", &settings, Path::new(r"E:\config"));

    assert!(args.contains(&"--hwdec=d3d11va".to_string()));
    assert!(args.contains(&"--save-position-on-quit=no".to_string()));
    assert!(args.contains(&"--sub-auto=fuzzy".to_string()));
    assert!(args.contains(&"--sub-font-size=48".to_string()));
    assert!(args.contains(&"--audio-channels=stereo".to_string()));
    assert!(args.contains(&"--audio-device=wasapi/{dev}".to_string()));
    assert!(args.contains(&"--audio-exclusive=yes".to_string()));
    assert!(args.contains(&"--sub-pos=88".to_string()));
    assert!(args.contains(&"--sub-ass-override=force".to_string()));
    assert!(args.contains(&"--audio-samplerate=48000".to_string()));
    assert!(args.contains(&"--audio-format=float".to_string()));
    assert!(args.contains(&format!("--audio-spdif={}", audio::SPDIF_CODECS)));
  }

  #[test]
  fn parse_audio_devices_reads_name_and_description() {
    let value = serde_json::json!([
      { "name": "auto", "description": "Autoselect device", "default": true },
      { "name": "wasapi/{dev}", "description": "耳机 (USB)" },
      { "description": "没有名字，只能丢掉" }
    ]);

    let devices = parse_audio_devices(&value);

    assert_eq!(devices.len(), 2);
    assert_eq!(devices[0].name, "auto");
    assert_eq!(devices[0].description, "Autoselect device");
    assert_eq!(devices[1].description, "耳机 (USB)");
  }

  /// 描述缺失时拿名字顶上去：列表里宁可有条丑的，也别少一条能用的设备。
  #[test]
  fn parse_audio_devices_falls_back_to_the_name() {
    let value = serde_json::json!([{ "name": "wasapi/{dev}", "description": "" }]);

    let devices = parse_audio_devices(&value);

    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].description, "wasapi/{dev}");
  }

  #[test]
  fn parse_audio_devices_tolerates_a_missing_property() {
    assert!(parse_audio_devices(&serde_json::Value::Null).is_empty());
  }

  #[test]
  fn delays_are_clamped_to_a_usable_range() {
    assert_eq!(clamp_delay(0.5), 0.5);
    assert_eq!(clamp_delay(999.0), DELAY_LIMIT);
    assert_eq!(clamp_delay(-999.0), -DELAY_LIMIT);
    // 坏值折到「跟没调一样」，而不是推到区间边缘
    assert_eq!(clamp_delay(f64::NAN), 0.0);
  }

  #[test]
  fn subtitle_ranges_match_mpv() {
    assert_eq!(clamp_range(0.0, SUB_FONT_SIZE_RANGE.0, SUB_FONT_SIZE_RANGE.1), 1.0);
    assert_eq!(
      clamp_range(99999.0, SUB_FONT_SIZE_RANGE.0, SUB_FONT_SIZE_RANGE.1),
      9000.0
    );
    assert_eq!(clamp_range(-5.0, SUB_POSITION_RANGE.0, SUB_POSITION_RANGE.1), 0.0);
    assert_eq!(clamp_range(300.0, SUB_POSITION_RANGE.0, SUB_POSITION_RANGE.1), 150.0);
  }

  /// watch-later 必须落在应用自己的配置目录里，不能去动用户手装 mpv 的那份。
  #[test]
  fn watch_later_lives_under_the_app_config_dir() {
    assert_eq!(
      watch_later_dir(Path::new(r"E:\config")),
      PathBuf::from(r"E:\config\watch-later")
    );
  }

  #[test]
  fn watch_later_directory_is_created_up_front() {
    let config_dir = std::env::temp_dir().join(format!("fuvideo-watch-later-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&config_dir);

    let created = prepare_watch_later_dir(&Settings::default(), &config_dir);

    assert_eq!(created, Some(watch_later_dir(&config_dir)));
    assert!(watch_later_dir(&config_dir).is_dir(), "目录要真的建出来");

    // 关掉「退出时记住位置」就不必建，免得留下一堆用不上的目录
    let without_saving = Settings {
      save_position: false,
      ..Settings::default()
    };
    assert_eq!(prepare_watch_later_dir(&without_saving, &config_dir), None);

    let _ = std::fs::remove_dir_all(&config_dir);
  }

  #[test]
  fn parse_tracks_reads_mpv_track_list() {
    let value = serde_json::json!([
      { "id": 1, "type": "video", "codec": "h264", "selected": true, "default": true },
      { "id": 2, "type": "audio", "codec": "aac", "lang": "jpn", "title": "日语", "selected": false },
      { "id": 3, "type": "sub", "external": true, "selected": false }
    ]);

    let tracks = parse_tracks(&value);

    assert_eq!(tracks.len(), 3);
    assert_eq!(tracks[0].kind, "video");
    assert!(tracks[0].selected);
    assert!(tracks[0].is_default);
    assert_eq!(tracks[1].lang.as_deref(), Some("jpn"));
    assert_eq!(tracks[1].title.as_deref(), Some("日语"));
    assert!(!tracks[1].selected);
    assert!(tracks[2].external, "外挂字幕要标出来");
    assert_eq!(tracks[2].codec, None);
  }

  #[test]
  fn parse_tracks_drops_entries_without_id_or_type() {
    let value = serde_json::json!([{ "type": "audio" }, { "id": 9 }, { "id": 4, "type": "audio" }]);

    let tracks = parse_tracks(&value);

    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, 4);
  }

  #[test]
  fn parse_tracks_tolerates_a_missing_property() {
    assert!(parse_tracks(&serde_json::Value::Null).is_empty());
  }

  /// 前端按 camelCase 读字段，名字一旦对不上，界面会静默拿到 undefined。
  #[test]
  fn details_serialize_camel_case_fields() {
    let details = PlayerDetails {
      path: Some(r"E:\clips\a.mkv".to_string()),
      tracks: vec![TrackInfo {
        id: 2,
        kind: "audio".to_string(),
        title: None,
        lang: Some("jpn".to_string()),
        codec: Some("aac".to_string()),
        selected: true,
        external: false,
        is_default: false,
      }],
      hwdec_current: Some("d3d11va".to_string()),
      secondary_subtitle_id: Some(5),
      audio_delay: -0.5,
      subtitle_delay: 1.25,
      subtitle_font_size: 44.0,
      subtitle_position: 88.0,
      audio_channels: "stereo".to_string(),
      audio_device: "wasapi/{dev}".to_string(),
      audio_exclusive: true,
      subtitle_style: "force".to_string(),
    };

    let value = serde_json::to_value(details).expect("序列化播放详情");

    for key in [
      "path",
      "tracks",
      "hwdecCurrent",
      "secondarySubtitleId",
      "audioDelay",
      "subtitleDelay",
      "subtitleFontSize",
      "subtitlePosition",
      "subtitleStyle",
      "audioChannels",
      "audioDevice",
      "audioExclusive",
    ] {
      assert!(value.get(key).is_some(), "详情里缺少字段 {key}");
    }

    let track = &value["tracks"][0];

    for key in ["id", "kind", "title", "lang", "codec", "selected", "external", "default"] {
      assert!(track.get(key).is_some(), "轨道缺少字段 {key}");
    }
  }

  #[test]
  fn idle_details_fall_back_to_mpv_defaults() {
    let details = idle_details();

    assert_eq!(details.path, None);
    assert!(details.tracks.is_empty());
    assert_eq!(details.subtitle_font_size, DEFAULT_SUB_FONT_SIZE);
    assert_eq!(details.subtitle_position, DEFAULT_SUB_POSITION);
    assert_eq!(details.audio_channels, DEFAULT_AUDIO_CHANNELS);
    assert_eq!(details.audio_device, DEFAULT_AUDIO_DEVICE);
    assert!(!details.audio_exclusive);
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

  #[test]
  fn bundled_path_takes_precedence() {
    let known = PathBuf::from(r"C:\Program Files\MPV Player\mpv.exe");

    if !known.is_file() {
      eprintln!("本机没有默认安装位置的 mpv，跳过");
      return;
    }

    assert_eq!(find_mpv_with(Some(&known)), Some(known));
  }

  #[test]
  fn missing_bundled_path_falls_back_to_system_mpv() {
    let missing = std::env::temp_dir().join("fuvideo-no-such-mpv.exe");
    let _ = std::fs::remove_file(&missing);

    let resolved = find_mpv_with(Some(&missing));

    // 自带的那份不存在时不能返回它，应该落到系统装的 mpv
    assert_ne!(resolved, Some(missing));

    if PathBuf::from(r"C:\Program Files\MPV Player\mpv.exe").is_file() {
      assert!(resolved.is_some(), "本机装了 mpv，应该能落到它");
    }
  }

  /// 轮询轨道表，直到满足条件或者超时，返回最后读到的轨道表。
  fn wait_for_tracks(
    client: &ipc::MpvIpc,
    predicate: impl Fn(&[TrackInfo]) -> bool,
    timeout: Duration,
  ) -> Vec<TrackInfo> {
    let deadline = Instant::now() + timeout;

    loop {
      let tracks = client
        .get_value("track-list")
        .ok()
        .flatten()
        .map(|value| parse_tracks(&value))
        .unwrap_or_default();

      if predicate(&tracks) || Instant::now() >= deadline {
        return tracks;
      }

      thread::sleep(Duration::from_millis(100));
    }
  }

  /// 等某个数值属性达到期望值。换片是异步的，只能轮询。
  fn wait_for_number_value(
    client: &ipc::MpvIpc,
    name: &str,
    expected: f64,
    timeout: Duration,
  ) -> bool {
    let deadline = Instant::now() + timeout;

    loop {
      if matches!(client.get_number(name), Ok(Some(value)) if (value - expected).abs() < 0.5) {
        return true;
      }

      if Instant::now() >= deadline {
        return false;
      }

      thread::sleep(Duration::from_millis(100));
    }
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

  /// mpv 子进程的看门狗：测试中途 panic 也要把它收掉。
  ///
  /// 漏下来的 mpv 会一直攥着父进程继承过去的管道句柄，
  /// 于是 `cargo test | ...` 这类用法会一直等不到结束，一个断言失败变成卡住不返回。
  struct ChildGuard(std::process::Child);

  impl Drop for ChildGuard {
    fn drop(&mut self) {
      let _ = self.0.kill();
      let _ = self.0.wait();
    }
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
    let _child = ChildGuard(
      Command::new(&executable)
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
        .expect("启动 mpv 失败"),
    );

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

  }

  /// 常驻内核的核心行为：同一个进程连续换片。
  ///
  /// 这条链路坏了，换片就会退化成「每次冷启动 + 每片重新找窗口」，
  /// 而这两种毛病在界面上都表现为「点了下一集要卡一下」。
  #[test]
  fn loadfile_swaps_files_without_restarting_mpv() {
    let Some(executable) = find_mpv() else {
      eprintln!("本机未安装 mpv，跳过常驻内核集成测试");
      return;
    };

    let pipe = next_pipe_name("test-loadfile");

    let child = Command::new(&executable)
      .args([
        format!("--input-ipc-server={pipe}"),
        "--vo=null".to_string(),
        "--ao=null".to_string(),
        "--no-terminal".to_string(),
        "--no-config".to_string(),
        "--idle=yes".to_string(),
        "--pause=yes".to_string(),
      ])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("启动 mpv 失败");

    let mut guard = ChildGuard(child);
    let client = ipc::connect_with_retry(&pipe, Duration::from_secs(20)).expect("连上 mpv 的 IPC 管道");

    // 启动时是空转的：这正是不带文件名的常驻进程该有的样子
    assert_eq!(
      client.get_number("duration").expect("读时长"),
      None,
      "还没载入文件时不该有时长"
    );

    // 两个源用不同画幅，换片成没成看画面尺寸最实在：
    // lavfi 的 duration 在暂停态下只是个估算值，不能拿它当判据。
    client
      .load_file("av://lavfi:testsrc=duration=4:size=320x240:rate=30")
      .expect("载入第一个文件");
    client.set_flag("pause", false).expect("开始播放，解码器才会报出画面尺寸");

    assert!(
      wait_for_number_value(&client, "width", 320.0, Duration::from_secs(20)),
      "第一个文件应该按 320 宽解码"
    );

    // 换片：同一个进程，只是换了文件
    client
      .load_file("av://lavfi:testsrc=duration=9:size=640x480:rate=30")
      .expect("载入第二个文件");

    assert!(
      wait_for_number_value(&client, "width", 640.0, Duration::from_secs(20)),
      "换片后应该按 640 宽解码"
    );

    assert!(
      guard.0.try_wait().ok().flatten().is_none(),
      "换片不该重启 mpv 进程"
    );
  }

  /// 优雅退出：发 `quit` 而不是 kill，mpv 才有机会把 watch-later 落盘。
  ///
  /// 这是 P4「记忆播放位置」的地基——进程被 kill 掉的话，mpv 根本没有
  /// 写文件的机会，界面再怎么记也没用。
  #[test]
  fn shutdown_lets_mpv_write_watch_later() {
    let Some(executable) = find_mpv() else {
      eprintln!("本机未安装 mpv，跳过优雅退出集成测试");
      return;
    };

    let config_dir = std::env::temp_dir().join(format!("fuvideo-shutdown-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&config_dir);

    let watch_later = watch_later_dir(&config_dir);
    std::fs::create_dir_all(&watch_later).expect("建 watch-later 目录");

    let pipe = next_pipe_name("test-quit");

    let child = Command::new(&executable)
      .args([
        format!("--input-ipc-server={pipe}"),
        "--vo=null".to_string(),
        "--ao=null".to_string(),
        "--no-terminal".to_string(),
        "--no-config".to_string(),
        "--idle=yes".to_string(),
        "--pause=yes".to_string(),
        "--save-position-on-quit=yes".to_string(),
        format!("--watch-later-dir={}", watch_later.display()),
      ])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("启动 mpv 失败");

    let state = PlayerState::default();
    *state.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(child);
    *state.ipc_pipe.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(pipe.clone());

    let client = ipc::connect_with_retry(&pipe, Duration::from_secs(20)).expect("连上 mpv 的 IPC 管道");
    *state.ipc.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(client);

    let source = "av://lavfi:testsrc=duration=30:size=320x240:rate=30";
    state.with_ipc(|client| client.load_file(source)).expect("载入文件");
    state.set_current_path(Some(source.to_string()));

    // 等文件真的载进来，再跳到 3 秒：停在 0 秒的话 mpv 不会写 watch-later
    let deadline = Instant::now() + Duration::from_secs(20);

    while Instant::now() < deadline {
      if state.with_ipc(|client| client.get_number("duration")).ok().flatten().is_some() {
        break;
      }

      thread::sleep(Duration::from_millis(100));
    }

    state.with_ipc(|client| client.seek_absolute(3.0)).expect("跳转");

    state.shutdown();

    assert!(!state.reap_dead_child(), "收尾之后不该还留着 mpv 进程");

    let written: Vec<PathBuf> = std::fs::read_dir(&watch_later)
      .expect("列 watch-later 目录")
      .filter_map(Result::ok)
      .map(|entry| entry.path())
      .collect();

    assert!(!written.is_empty(), "退出时应该写出 watch-later 记录");

    let _ = std::fs::remove_dir_all(&config_dir);
  }

  /// 起一个无界面的 mpv 并连上 IPC，测试里反复要用的那一段。
  fn spawn_headless(label: &str, extra: &[String]) -> (ChildGuard, ipc::MpvIpc) {
    let executable = find_mpv().expect("调用方先确认本机有 mpv");
    let pipe = next_pipe_name(label);

    let mut args = vec![
      format!("--input-ipc-server={pipe}"),
      "--vo=null".to_string(),
      "--ao=null".to_string(),
      "--no-terminal".to_string(),
      "--no-config".to_string(),
      "--idle=yes".to_string(),
      "--pause=yes".to_string(),
    ];
    args.extend_from_slice(extra);

    let child = Command::new(&executable)
      .args(&args)
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("启动 mpv 失败");

    let client = ipc::connect_with_retry(&pipe, Duration::from_secs(20)).expect("连上 mpv 的 IPC 管道");

    (ChildGuard(child), client)
  }

  /// 挂外挂字幕是 P1 的主功能：从选文件到 mpv 真的多出一条已选中的外挂字幕轨。
  #[test]
  fn adding_a_subtitle_file_shows_up_as_a_selected_external_track() {
    if find_mpv().is_none() {
      eprintln!("本机未安装 mpv，跳过外挂字幕集成测试");
      return;
    }

    let directory = std::env::temp_dir().join(format!("fuvideo-subtitle-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir_all(&directory).expect("建目录");

    let subtitle = directory.join("sample.srt");
    std::fs::write(
      &subtitle,
      "1\n00:00:00,000 --> 00:00:02,000\n第一句\n\n2\n00:00:02,000 --> 00:00:04,000\n第二句\n",
    )
    .expect("写测试字幕");

    let (_guard, client) = spawn_headless("test-sub", &[]);

    client
      .load_file("av://lavfi:testsrc=duration=5:size=320x240:rate=30")
      .expect("载入视频");

    let before = wait_for_tracks(&client, |tracks| !tracks.is_empty(), Duration::from_secs(20));
    assert!(
      !before.iter().any(|track| track.kind == "sub"),
      "这个源本身不该带字幕轨"
    );

    client
      .add_subtitle(&subtitle.to_string_lossy())
      .expect("挂上外挂字幕");

    let tracks = wait_for_tracks(
      &client,
      |tracks| tracks.iter().any(|track| track.kind == "sub" && track.external),
      Duration::from_secs(20),
    );

    let track = tracks
      .iter()
      .find(|track| track.kind == "sub" && track.external)
      .expect("挂上去的字幕应该出现在轨道表里");

    assert!(track.selected, "带 select 标记挂上去之后应当直接选中");

    let _ = std::fs::remove_dir_all(&directory);
  }

  /// 写一个最小的 16bit 单声道 WAV 当外挂音轨。
  ///
  /// 内容是静音：测试只关心「多出一条能选中的音轨」，不需要真的响。
  fn write_test_wav(path: &Path) -> Result<(), String> {
    const SAMPLE_RATE: u32 = 8000;
    const SAMPLE_COUNT: u32 = SAMPLE_RATE; // 1 秒
    const DATA_BYTES: u32 = SAMPLE_COUNT * 2;

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + DATA_BYTES).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes()); // fmt 块长度
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&1u16.to_le_bytes()); // 单声道
    bytes.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    bytes.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // 字节率
    bytes.extend_from_slice(&2u16.to_le_bytes()); // 块对齐
    bytes.extend_from_slice(&16u16.to_le_bytes()); // 位深
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&DATA_BYTES.to_le_bytes());
    bytes.resize(bytes.len() + DATA_BYTES as usize, 0);

    std::fs::write(path, bytes).map_err(|error| format!("写测试音频失败: {error}"))
  }

  /// 外挂音轨 + 音轨开关。界面上的「音轨列表点一下」走的就是 `aid`：
  /// 选某一条用数字，关掉用字面量 `no`。
  ///
  /// 这里挂在带视频轨的文件上：纯音频文件在 `aid=no` 之后会把整片卸掉，
  /// 再想选回来就已经没有文件了，那是源的问题，不是这条链路的问题。
  #[test]
  fn external_audio_track_can_be_selected_and_switched_off() {
    if find_mpv().is_none() {
      eprintln!("本机未安装 mpv，跳过音轨切换集成测试");
      return;
    }

    let directory = std::env::temp_dir().join(format!("fuvideo-audio-track-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir_all(&directory).expect("建目录");

    let track = directory.join("track.wav");
    write_test_wav(&track).expect("写测试音轨");

    let (_guard, client) = spawn_headless("test-aid", &[]);

    client
      .load_file("av://lavfi:testsrc=duration=30:size=320x240:rate=30")
      .expect("载入视频");

    wait_for_tracks(&client, |tracks| !tracks.is_empty(), Duration::from_secs(20));

    client
      .add_audio(&track.to_string_lossy())
      .expect("挂上外挂音轨");

    let tracks = wait_for_tracks(
      &client,
      |tracks| tracks.iter().any(|track| track.kind == "audio" && track.external),
      Duration::from_secs(20),
    );

    let audio = tracks
      .iter()
      .find(|track| track.kind == "audio")
      .expect("挂上去的音轨应该出现在轨道表里");

    assert!(audio.selected, "带 select 标记挂上去之后应当直接选中");

    // 按 id 选中（界面点某一轨就是这条路）
    client.select_track("aid", audio.id).expect("按 id 选中音轨");

    client.set_string("aid", "no").expect("关掉音频");

    let muted = wait_for_tracks(
      &client,
      |tracks| !tracks.iter().any(|track| track.kind == "audio" && track.selected),
      Duration::from_secs(20),
    );

    assert!(
      !muted.iter().any(|track| track.kind == "audio" && track.selected),
      "aid=no 之后不该还有选中的音频轨"
    );

    client.select_track("aid", audio.id).expect("选回音轨");

    let restored = wait_for_tracks(
      &client,
      |tracks| tracks.iter().any(|track| track.kind == "audio" && track.selected),
      Duration::from_secs(20),
    );

    assert!(
      restored.iter().any(|track| track.kind == "audio" && track.selected),
      "选回 aid 之后音频轨应当重新被选中"
    );

    let _ = std::fs::remove_dir_all(&directory);
  }

  /// 把 mpv 回读的 `af` 属性里的标签按顺序取出来。
  fn filter_labels(value: &Value) -> Vec<String> {
    value
      .as_array()
      .map(|items| {
        items
          .iter()
          .filter_map(|item| item.get("label").and_then(Value::as_str).map(str::to_string))
          .collect()
      })
      .unwrap_or_default()
  }

  /// 滤镜链真的挂到 mpv 上了吗——这是 P2 的地基，链子断了所有音效都是摆设。
  ///
  /// 跑在 `--ao=null` 下不会出声，也不会碰用户的音频设备。
  #[test]
  fn audio_filter_chain_reaches_mpv() {
    if find_mpv().is_none() {
      eprintln!("本机未安装 mpv，跳过音频滤镜集成测试");
      return;
    }

    let (_guard, client) = spawn_headless("test-af", &[]);

    client
      .load_file("av://lavfi:sine=frequency=440:duration=30:sample_rate=48000")
      .expect("载入音频");

    wait_for_tracks(&client, |tracks| !tracks.is_empty(), Duration::from_secs(20));

    let settings = Settings {
      loudness_normalization: true,
      stereo_widening: true,
      equalizer_bands: Some({
        let mut bands = vec![0.0; settings::EQUALIZER_BANDS];
        bands[0] = 6.0;
        bands
      }),
      ..Settings::default()
    };

    let chain = audio::build_filter_chain(&settings);
    assert_eq!(chain.len(), 3, "一段均衡 + 响度归一化 + 立体声扩展: {chain:?}");

    client.set_audio_filters(&chain).expect("挂上滤镜链");

    // 回读 mpv 认下来的链：标签和顺序都要和交上去的一致
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut labels = Vec::new();

    while Instant::now() < deadline {
      labels = client
        .get_value("af")
        .ok()
        .flatten()
        .map(|value| filter_labels(&value))
        .unwrap_or_default();

      if labels.len() == 3 {
        break;
      }

      thread::sleep(Duration::from_millis(100));
    }

    assert_eq!(labels, vec!["eq00", "norm", "wide"]);

    // 清空：用户把效果全关掉走的就是这条路
    client.set_audio_filters(&[]).expect("清空滤镜链");

    let cleared = client
      .get_value("af")
      .ok()
      .flatten()
      .map(|value| filter_labels(&value))
      .unwrap_or_default();

    assert!(cleared.is_empty(), "清空之后链上不该还有东西: {cleared:?}");
  }
}
