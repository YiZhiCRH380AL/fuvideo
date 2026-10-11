//! mpv 播放内核的探测与进程管理。
//!
//! M0 的验证目标是打通「HTML 界面 + mpv 渲染」这条链路：mpv 作为子进程启动，
//! 通过 `--wid` 嵌入主窗口，并把自己创建的窗口压到 z-order 底部，让透明的
//! WebView 界面浮在画面之上。

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;

/// 允许通过环境变量指定 mpv 可执行文件，便于开发时指向自备的解压版 mpv。
pub const MPV_PATH_ENV: &str = "FUVIDEO_MPV_PATH";

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
pub struct MpvProbe {
  pub available: bool,
  pub version: Option<String>,
  pub path: Option<String>,
}

#[derive(Default)]
pub struct PlayerState {
  child: Mutex<Option<Child>>,
}

impl PlayerState {
  /// 换上一个新的播放进程，同时结束上一个，保证同一时间只跑一个 mpv。
  fn replace(&self, child: Child) {
    let mut slot = self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(mut previous) = slot.take() {
      let _ = previous.kill();
      let _ = previous.wait();
    }

    *slot = Some(child);
  }

  /// 停止当前播放。没有在播放时是空操作。
  fn stop(&self) {
    let mut slot = self.child.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(mut child) = slot.take() {
      let _ = child.kill();
      let _ = child.wait();
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
pub fn build_play_args(window_handle: isize, path: &str) -> Vec<String> {
  vec![
    format!("--wid={window_handle}"),
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
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/* ---------------- Windows 子窗口处理 ---------------- */

#[cfg(windows)]
mod win {
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
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
}

#[cfg(not(windows))]
mod win {
  pub fn child_windows(_parent: isize) -> Vec<isize> {
    Vec::new()
  }

  pub fn send_to_bottom(_hwnd: isize) {}
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

  // mpv 建窗是异步的，先记录已有子窗口，启动后对比出 mpv 新建的那个。
  let before = win::child_windows(window_handle);

  let mut command = Command::new(&executable);
  command.args(build_play_args(window_handle, &path));

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

  state.replace(child);

  std::thread::sleep(Duration::from_millis(500));

  for handle in win::child_windows(window_handle) {
    if !before.contains(&handle) {
      win::send_to_bottom(handle);
    }
  }

  Ok(())
}

/// 停止当前播放。
#[tauri::command(async)]
pub fn stop_video(state: tauri::State<'_, PlayerState>) {
  state.stop();
}

#[cfg(test)]
mod tests {
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
    let args = build_play_args(4242, r"E:\clips\sample.mkv");

    assert!(args.contains(&"--wid=4242".to_string()));
    assert!(args.contains(&"--osc=no".to_string()));
    assert!(args.contains(&"--hwdec=auto-safe".to_string()));
    assert_eq!(args.last(), Some(&r"E:\clips\sample.mkv".to_string()));
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
}
