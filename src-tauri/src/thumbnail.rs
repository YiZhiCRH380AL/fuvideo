//! 画面抓取。
//!
//! 两处用到：方格页面取每个视频的第一帧，以及鼠标停在进度条上时的画面预览。
//! 抓帧不能让正在播放的实例去做——那会打断播放。所以另起一个无界面的 mpv
//! （`--vo=image --pause=yes --idle=yes`），需要哪个文件就用 `loadfile` 切过去，
//! 再精确跳到目标时间点截图。整个进程常驻，换片不重启。

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde_json::json;

use crate::mpv::{self, ipc};

/// 从跳转到截图落盘的等待上限。
const CAPTURE_TIMEOUT: Duration = Duration::from_millis(4000);
/// 换片子时的等待上限。文件损坏时不必死等。
const LOAD_TIMEOUT: Duration = Duration::from_secs(6);
/// 每次尝试截图前的等待。
const SETTLE_DELAY: Duration = Duration::from_millis(120);

struct Worker {
  child: Child,
  client: ipc::MpvIpc,
  output: PathBuf,
  source: Option<String>,
}

impl Worker {
  fn start() -> Result<Self, String> {
    let executable = mpv::find_mpv().ok_or_else(|| "未找到 mpv，无法生成画面".to_string())?;
    let directory = output_directory();

    std::fs::create_dir_all(&directory).map_err(|error| format!("建立预览目录失败: {error}"))?;
    // 上一次留下的编号图没必要积着
    clear_directory(&directory);

    let output = directory.join("frame.jpg");
    let pipe = mpv::next_pipe_name("thumb");

    let mut command = Command::new(&executable);
    command.args([
      format!("--input-ipc-server={pipe}"),
      "--no-config".to_string(),
      "--vo=image".to_string(),
      "--vo-image-format=jpg".to_string(),
      "--vo-image-jpeg-quality=80".to_string(),
      format!("--vo-image-outdir={}", directory.display()),
      "--no-audio".to_string(),
      "--pause=yes".to_string(),
      "--hr-seek=yes".to_string(),
      // 先空转，文件由 loadfile 送来
      "--idle=yes".to_string(),
      "--no-terminal".to_string(),
      "--no-input-default-bindings".to_string(),
    ]);

    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      command.creation_flags(mpv::CREATE_NO_WINDOW);
    }

    let child = command
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .map_err(|error| format!("启动抓帧进程失败: {error}"))?;

    let client = match connect_with_retry(&pipe, Duration::from_secs(10)) {
      Ok(client) => client,
      Err(error) => {
        // 连不上就别把进程留在后台
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
      }
    };

    Ok(Self {
      child,
      client,
      output,
      source: None,
    })
  }

  /// 需要哪个文件就载入哪个文件，已经在放同一个文件时什么都不做。
  fn load(&mut self, source: &str) -> Result<(), String> {
    if self.source.as_deref() == Some(source) {
      return Ok(());
    }

    self
      .client
      .request(json!(["loadfile", source]))
      .map_err(|error| format!("载入视频失败: {error}"))?;

    self.source = Some(source.to_string());

    if !wait_for_source(&self.client, source, LOAD_TIMEOUT) {
      self.source = None;
      return Err(format!("等不到 mpv 载入 {source}"));
    }

    Ok(())
  }

  fn capture(&self, seconds: f64) -> Result<PathBuf, String> {
    // 刚载入的文件可能还没解码就绪：seek 会被拒、截图会没有画面。
    // 这里不猜固定等待时长，而是整段重试，快机器上第一次就成。
    let deadline = Instant::now() + CAPTURE_TIMEOUT;
    let mut last_error = String::from("截图命令没有成功");

    while Instant::now() < deadline {
      let _ = std::fs::remove_file(&self.output);

      if let Err(error) = self.client.seek_exact(seconds) {
        last_error = error.to_string();
        std::thread::sleep(SETTLE_DELAY);
        continue;
      }

      wait_until_position(&self.client, seconds);
      std::thread::sleep(SETTLE_DELAY);

      match self.client.request(json!([
        "screenshot-to-file",
        self.output.to_string_lossy().to_string(),
        "video"
      ])) {
        Ok(_) => {
          if wait_for_file(&self.output, Duration::from_millis(600)).is_ok() {
            return Ok(self.output.clone());
          }

          last_error = "截图文件没有生成".to_string();
        }
        Err(error) => last_error = error.to_string(),
      }
    }

    Err(format!("截图失败: {last_error}"))
  }
}

#[derive(Default)]
pub struct ThumbnailState {
  worker: Mutex<Option<Worker>>,
}

impl ThumbnailState {
  pub fn shutdown(&self) {
    let mut slot = self.worker.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(mut worker) = slot.take() {
      let _ = worker.child.kill();
      let _ = worker.child.wait();
    }
  }

  /// 抓取某个视频在指定秒数的画面，返回可以直接塞进 img 的 data URL。
  pub fn capture(&self, source: &str, seconds: f64) -> Result<String, String> {
    let mut slot = self.worker.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if slot.is_none() {
      *slot = Some(Worker::start()?);
    }

    let worker = slot.as_mut().ok_or_else(|| "抓帧进程未就绪".to_string())?;

    worker.load(source)?;
    let path = worker.capture(seconds)?;

    encode_data_url(&path)
  }
}

/// 抓取指定视频在指定时间点的画面。
#[tauri::command(async)]
pub fn thumbnail_at(
  state: tauri::State<'_, ThumbnailState>,
  source: String,
  position: f64,
) -> Result<String, String> {
  state.capture(&source, position)
}

fn output_directory() -> PathBuf {
  std::env::temp_dir().join("fuvideo-preview")
}

fn clear_directory(directory: &Path) {
  if let Ok(entries) = std::fs::read_dir(directory) {
    for entry in entries.flatten() {
      let _ = std::fs::remove_file(entry.path());
    }
  }
}

/// 等抓帧进程把管道建出来。重试逻辑和播放内核共用一份，别在这儿再写一遍。
fn connect_with_retry(pipe: &str, timeout: Duration) -> Result<ipc::MpvIpc, String> {
  ipc::connect_with_retry(pipe, timeout)
}

/// 等 mpv 真正切到目标文件。换片时 duration 还是上一个文件的值，不能作为判据。
fn wait_for_source(client: &ipc::MpvIpc, source: &str, timeout: Duration) -> bool {
  let deadline = Instant::now() + timeout;

  while Instant::now() < deadline {
    let path_matches = matches!(client.get_string("path"), Ok(Some(path)) if path == source);
    // path 会在解码完成前就生效，所以还要等时长出来，才算真的加载好
    let duration_ready = matches!(client.get_number("duration"), Ok(Some(duration)) if duration > 0.0);

    if path_matches && duration_ready {
      return true;
    }

    std::thread::sleep(Duration::from_millis(60));
  }

  false
}

/// 等播放位置落到目标附近。超时就放弃，让截图去抓当下这一帧。
fn wait_until_position(client: &ipc::MpvIpc, seconds: f64) {
  let deadline = Instant::now() + CAPTURE_TIMEOUT;

  while Instant::now() < deadline {
    match client.get_number("time-pos") {
      Ok(Some(position)) if (position - seconds).abs() < 0.15 => return,
      _ => std::thread::sleep(Duration::from_millis(40)),
    }
  }
}

fn wait_for_file(path: &Path, timeout: Duration) -> Result<(), String> {
  let deadline = Instant::now() + timeout;

  while Instant::now() < deadline {
    if let Ok(metadata) = std::fs::metadata(path) {
      if metadata.len() > 0 {
        return Ok(());
      }
    }

    std::thread::sleep(Duration::from_millis(40));
  }

  Err("截图文件没有生成".to_string())
}

fn encode_data_url(path: &Path) -> Result<String, String> {
  let bytes = std::fs::read(path).map_err(|error| format!("读取截图失败: {error}"))?;
  let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

  Ok(format!("data:image/jpeg;base64,{encoded}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn has_mpv() -> bool {
    mpv::find_mpv().is_some()
  }

  #[test]
  fn encode_data_url_wraps_file_content() {
    let path = std::env::temp_dir().join("fuvideo-encode-test.jpg");
    std::fs::write(&path, b"jpeg-bytes").expect("写入测试文件");

    let data_url = encode_data_url(&path).expect("编码");

    assert!(data_url.starts_with("data:image/jpeg;base64,"));
    assert!(data_url.ends_with("anBlZy1ieXRlcw=="), "实际: {data_url}");

    let _ = std::fs::remove_file(&path);
  }

  #[test]
  fn captures_first_frame_of_real_videos() {
    if !has_mpv() {
      eprintln!("本机未安装 mpv，跳过抓帧集成测试");
      return;
    }

    let state = ThumbnailState::default();
    let first = "av://lavfi:testsrc=duration=4:size=320x240:rate=30";
    let second = "av://lavfi:smptebars=duration=4:size=320x240:rate=30";

    let first_frame = state.capture(first, 0.0).expect("抓第一个视频的首帧");
    assert!(first_frame.starts_with("data:image/jpeg;base64,"));
    assert!(first_frame.len() > 1000, "首帧内容过小: {} 字节", first_frame.len());

    // 换一个来源：验证 loadfile 切换之后抓到的确实是新文件
    let second_frame = state.capture(second, 0.0).expect("抓第二个视频的首帧");
    assert!(second_frame.starts_with("data:image/jpeg;base64,"));
    assert_ne!(first_frame, second_frame, "两个视频的首帧不该完全相同");

    state.shutdown();
  }
}
