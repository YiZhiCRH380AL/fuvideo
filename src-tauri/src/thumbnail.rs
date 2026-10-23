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
  directory: PathBuf,
  source: Option<String>,
}

impl Worker {
  fn start() -> Result<Self, String> {
    let executable = mpv::find_mpv().ok_or_else(|| "未找到 mpv，无法生成画面".to_string())?;
    let directory = output_directory();

    std::fs::create_dir_all(&directory).map_err(|error| format!("建立预览目录失败: {error}"))?;
    // 上一次留下的编号图没必要积着
    clear_directory(&directory);

    let pipe = mpv::next_pipe_name("thumb");

    let mut command = Command::new(&executable);
    command.args([
      format!("--input-ipc-server={pipe}"),
      "--no-config".to_string(),
      "--vo=image".to_string(),
      "--vo-image-format=jpg".to_string(),
      "--vo-image-jpeg-quality=80".to_string(),
      format!("--vo-image-outdir={}", directory.display()),
      "--image-display-duration=inf".to_string(),
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
      directory,
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
      let duration = self.client.get_number("duration").ok().flatten();
      let previous_output = newest_frame(&self.directory);
      // 片尾直接 seek 到 duration 容易落进 EOF；留 0.1 秒保证还能刷新出一帧。
      let target = duration
        .map(|duration| seconds.min((duration - 0.1).max(0.0)))
        .unwrap_or(seconds);

      if let Err(error) = self.client.seek_exact(target) {
        last_error = error.to_string();
        std::thread::sleep(SETTLE_DELAY);
        continue;
      }

      if !wait_until_position(&self.client, target) {
        last_error = format!("跳转没有落到 {target:.3} 秒");
        continue;
      }

      std::thread::sleep(SETTLE_DELAY);

      match wait_for_new_frame(
        &self.directory,
        previous_output.as_deref(),
        Duration::from_millis(1200),
      ) {
        Ok(path) => return Ok(path),
        Err(error) => last_error = error,
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

/// 等播放位置落到目标附近。超时必须返回失败，不能把旧位置截成新时间点的画面。
fn wait_until_position(client: &ipc::MpvIpc, seconds: f64) -> bool {
  let deadline = Instant::now() + CAPTURE_TIMEOUT;

  while Instant::now() < deadline {
    match client.get_number("time-pos") {
      Ok(Some(position)) if (position - seconds).abs() < 0.15 => return true,
      _ => std::thread::sleep(Duration::from_millis(40)),
    }
  }

  false
}

fn newest_frame(directory: &Path) -> Option<PathBuf> {
  newest_frame_since(directory, None)
}

fn newest_frame_since(directory: &Path, previous: Option<&Path>) -> Option<PathBuf> {
  std::fs::read_dir(directory)
    .ok()?
    .flatten()
    .filter_map(|entry| {
      let path = entry.path();
      if path.extension().and_then(|extension| extension.to_str()) != Some("jpg") {
        return None;
      }

      if previous.is_some_and(|previous| {
        path.file_name() <= previous.file_name()
      }) {
        return None;
      }

      let metadata = entry.metadata().ok()?;
      (metadata.is_file() && metadata.len() > 0).then_some((metadata.modified().ok()?, path))
    })
    .max_by_key(|(modified, _)| *modified)
    .map(|(_, path)| path)
}

fn wait_for_new_frame(
  directory: &Path,
  previous: Option<&Path>,
  timeout: Duration,
) -> Result<PathBuf, String> {
  let deadline = Instant::now() + timeout;

  while Instant::now() < deadline {
    if let Some(path) = newest_frame_since(directory, previous) {
      return Ok(path);
    }

    std::thread::sleep(Duration::from_millis(40));
  }

  Err("视频输出没有生成新图片".to_string())
}

fn encode_data_url(path: &Path) -> Result<String, String> {
  let bytes = std::fs::read(path).map_err(|error| format!("读取截图失败: {error}"))?;
  let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

  Ok(format!("data:image/jpeg;base64,{encoded}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn decode_jpeg(data_url: &str) -> Vec<u8> {
    let encoded = data_url
      .strip_prefix("data:image/jpeg;base64,")
      .expect("data URL 前缀");
    base64::engine::general_purpose::STANDARD
      .decode(encoded)
      .expect("解码 JPEG")
  }

  fn capture_with_fresh_mpv(source: &str, seconds: f64) -> Vec<u8> {
    let executable = mpv::find_mpv().expect("找到 mpv");
    let directory = std::env::temp_dir().join(format!(
      "fuvideo-reference-{}-{}",
      std::process::id(),
      seconds
    ));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir_all(&directory).expect("建立参照目录");

    let status = Command::new(executable)
      .args([
        "--no-config".to_string(),
        "--no-terminal".to_string(),
        "--vo=image".to_string(),
        "--vo-image-format=jpg".to_string(),
        "--vo-image-jpeg-quality=80".to_string(),
        format!("--vo-image-outdir={}", directory.display()),
        "--no-audio".to_string(),
        "--hr-seek=yes".to_string(),
        format!("--start={seconds}"),
        "--frames=1".to_string(),
        source.to_string(),
      ])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status()
      .expect("启动参照 mpv");
    assert!(status.success(), "参照 mpv 退出码非零");

    let path = newest_frame(&directory).expect("参照帧文件");
    let bytes = std::fs::read(path).expect("读取参照帧");
    let _ = std::fs::remove_dir_all(directory);
    bytes
  }

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
    let first = "av://lavfi:testsrc=duration=8:size=320x240:rate=30";
    let second = "av://lavfi:smptebars=duration=4:size=320x240:rate=30";

    let first_frame = state.capture(first, 0.0).expect("抓第一个视频的首帧");
    assert!(first_frame.starts_with("data:image/jpeg;base64,"));
    assert!(first_frame.len() > 1000, "首帧内容过小: {} 字节", first_frame.len());

    // 连续向前抓帧：任何两个时间点都不该拿到同一张画面。
    // 如果截图落后一拍，1 秒位置会重复 0 秒帧，这个断言会立刻失败。
    let mut frames = vec![first_frame];

    for seconds in [2.0, 4.0, 6.0] {
      frames.push(
        state
          .capture(first, seconds)
          .unwrap_or_else(|error| panic!("抓 {seconds} 秒处的画面失败: {error}")),
      );
    }

    for left in 0..frames.len() {
      for right in left + 1..frames.len() {
        assert_ne!(
          frames[left], frames[right],
          "抓帧落后：第 {left} 张和第 {right} 张完全相同"
        );
      }
    }

    // 换一个来源：验证 loadfile 切换之后抓到的确实是新文件
    let second_frame = state.capture(second, 0.0).expect("抓第二个视频的首帧");
    assert!(second_frame.starts_with("data:image/jpeg;base64,"));
    assert_ne!(frames[0], second_frame, "两个视频的首帧不该完全相同");

    state.shutdown();
  }

  /// 可选的真实视频回归：设置 FUVIDEO_TEST_VIDEO 后，连续抓三个时间点。
  /// 不设置环境变量时直接跳过，避免测试依赖开发机上的私人媒体。
  #[test]
  fn captures_a_real_video_at_distinct_times() {
    let Ok(source) = std::env::var("FUVIDEO_TEST_VIDEO") else {
      return;
    };

    let state = ThumbnailState::default();
    let mut frames = Vec::new();

    for seconds in [1.0, 30.0, 60.0] {
      let data_url = state
        .capture(&source, seconds)
        .unwrap_or_else(|error| panic!("抓 {seconds} 秒失败: {error}"));
      assert!(
        data_url.starts_with("data:image/jpeg;base64,"),
        "{seconds} 秒没有返回 JPEG"
      );

      if let Some(encoded) = data_url.strip_prefix("data:image/jpeg;base64,") {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
          let path = std::env::temp_dir().join(format!("fuvideo-real-{seconds:.0}s.jpg"));
          let _ = std::fs::write(path, bytes);
        }
      }

      frames.push(data_url);
    }

    assert!(frames[0] != frames[1], "30 秒抓帧重复了 1 秒画面");
    assert!(frames[1] != frames[2], "60 秒抓帧重复了 30 秒画面");
    assert!(frames[0] != frames[2], "60 秒抓帧重复了 1 秒画面");

    let reference = capture_with_fresh_mpv(&source, 30.0);
    assert_eq!(
      decode_jpeg(&frames[1]),
      reference,
      "常驻抓帧结果与全新 mpv 的 30 秒参照不一致"
    );
    state.shutdown();
  }
}
