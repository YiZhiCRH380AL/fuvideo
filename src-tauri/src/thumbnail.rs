//! 鼠标停在进度条上时的画面预览。
//!
//! 截图不能让正在播放的实例去做——那会打断播放。所以另起一个无界面的 mpv
//! （`--vo=image` + `--pause=yes`），需要哪一帧就精确跳过去再截图。

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde_json::json;

use crate::mpv::{self, ipc};

/// 从跳转到截图落盘的等待上限。
const CAPTURE_TIMEOUT: Duration = Duration::from_millis(2500);
/// 跳转之后留给 mpv 稳定画面的时间。
const SETTLE_DELAY: Duration = Duration::from_millis(80);

struct Worker {
  child: Child,
  client: ipc::MpvIpc,
  output: PathBuf,
}

impl Worker {
  fn start(source: &str) -> Result<Self, String> {
    let executable = mpv::find_mpv().ok_or_else(|| "未找到 mpv，无法生成预览".to_string())?;
    let directory = output_directory();

    std::fs::create_dir_all(&directory).map_err(|error| format!("建立预览目录失败: {error}"))?;
    // 上一次留下的编号图没必要积着
    clear_directory(&directory);

    let output = directory.join("preview.jpg");
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
      "--no-terminal".to_string(),
      "--no-input-default-bindings".to_string(),
      source.to_string(),
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
      .map_err(|error| format!("启动预览进程失败: {error}"))?;

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

    // 等文件真正载入，否则第一次截图会落空
    wait_for_duration(&client);

    Ok(Self { child, client, output })
  }

  fn capture(&self, seconds: f64) -> Result<PathBuf, String> {
    let _ = std::fs::remove_file(&self.output);

    self.client.seek_exact(seconds).map_err(|error| error.to_string())?;
    wait_until_position(&self.client, seconds);

    std::thread::sleep(SETTLE_DELAY);

    self
      .client
      .request(json!([
        "screenshot-to-file",
        self.output.to_string_lossy().to_string(),
        "video"
      ]))
      .map_err(|error| error.to_string())?;

    wait_for_file(&self.output, CAPTURE_TIMEOUT)?;

    Ok(self.output.clone())
  }
}

#[derive(Default)]
pub struct ThumbnailState {
  worker: Mutex<Option<Worker>>,
  source: Mutex<Option<String>>,
}

impl ThumbnailState {
  /// 换片时调用。源变了就把旧的预览进程收掉，新源由下一次截图按需启动。
  pub fn set_source(&self, source: Option<String>) {
    {
      let mut current = self.source.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

      if *current == source {
        return;
      }

      *current = source;
    }

    // 注意先释放 source 锁再动 worker，避免和 capture 的加锁顺序相反
    self.stop_worker();
  }

  pub fn shutdown(&self) {
    self.stop_worker();
  }

  /// 抓取指定秒数的画面，返回可以直接塞进 img 的 data URL。
  pub fn capture(&self, seconds: f64) -> Result<String, String> {
    let mut slot = self.worker.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if slot.is_none() {
      let source = self
        .source
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
        .ok_or_else(|| "还没有加载视频".to_string())?;

      *slot = Some(Worker::start(&source)?);
    }

    let worker = slot.as_ref().ok_or_else(|| "预览进程未就绪".to_string())?;
    let path = worker.capture(seconds)?;

    encode_data_url(&path)
  }

  fn stop_worker(&self) {
    let mut slot = self.worker.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(mut worker) = slot.take() {
      let _ = worker.child.kill();
      let _ = worker.child.wait();
    }
  }
}

/// 抓取指定时间点的画面。
#[tauri::command(async)]
pub fn thumbnail_at(state: tauri::State<'_, ThumbnailState>, position: f64) -> Result<String, String> {
  state.capture(position)
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

fn connect_with_retry(pipe: &str, timeout: Duration) -> Result<ipc::MpvIpc, String> {
  let deadline = Instant::now() + timeout;
  let mut last_error = String::from("预览进程没有建立通信管道");

  while Instant::now() < deadline {
    match ipc::MpvIpc::connect(pipe) {
      Ok(client) => return Ok(client),
      Err(error) => last_error = error,
    }

    std::thread::sleep(Duration::from_millis(150));
  }

  Err(last_error)
}

fn wait_for_duration(client: &ipc::MpvIpc) {
  let deadline = Instant::now() + Duration::from_secs(10);

  while Instant::now() < deadline {
    if let Ok(Some(duration)) = client.get_number("duration") {
      if duration > 0.0 {
        return;
      }
    }

    std::thread::sleep(Duration::from_millis(100));
  }
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

  #[test]
  fn capture_without_source_reports_error() {
    let state = ThumbnailState::default();

    assert!(state.capture(1.0).is_err());
  }

  #[test]
  fn captures_a_real_frame_through_mpv() {
    if mpv::find_mpv().is_none() {
      eprintln!("本机未安装 mpv，跳过缩略图集成测试");
      return;
    }

    let state = ThumbnailState::default();
    state.set_source(Some("av://lavfi:testsrc=duration=4:size=320x240:rate=30".to_string()));

    let data_url = state.capture(0.5).expect("抓取缩略图");

    assert!(data_url.starts_with("data:image/jpeg;base64,"), "应返回 JPEG data URL");
    assert!(data_url.len() > 1000, "缩略图内容过小: {} 字节", data_url.len());

    state.shutdown();
  }
}
