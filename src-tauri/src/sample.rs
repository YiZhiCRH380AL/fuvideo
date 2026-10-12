//! 自带的示例视频。
//!
//! 教程要让用户**真的操作一遍**，而「选一个文件夹」这件事对刚上手的人是个门槛：
//! 他不知道选哪、手边也不一定有视频。所以随安装包带一个十几秒的小片段和一条字幕，
//! 第一次点「看示例」时复制到应用配置目录下，再当作普通目录打开。
//!
//! 为什么要复制出来：安装目录里的资源是只读的，而「打开目录」需要一个真实目录，
//! 用户以后还会往里面放自己的文件。已经存在的文件一律不覆盖——用户改过的字幕、
//! 拖过的进度都不该被一次点击抹掉。

use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

/// 跟着安装包走的示例文件，名字和 `src-tauri/resources/sample/` 里的一致。
pub const SAMPLE_FILES: [&str; 2] = ["示例视频.mp4", "示例视频.srt"];

/// 放在应用配置目录下的文件夹名。
pub const SAMPLE_FOLDER: &str = "示例视频";

/// 把缺失的示例文件从 `source` 复制到 `target`，返回复制了几个。
///
/// 已经存在的不动。源文件缺失才算错误——那说明打包时漏了资源。
pub fn copy_missing(source: &Path, target: &Path) -> Result<usize, String> {
  fs::create_dir_all(target).map_err(|error| format!("创建示例文件夹失败: {error}"))?;

  let mut copied = 0;

  for name in SAMPLE_FILES {
    let destination = target.join(name);

    if destination.is_file() {
      continue;
    }

    let origin = source.join(name);

    if !origin.is_file() {
      return Err(format!("自带的示例文件不见了: {}", origin.display()));
    }

    fs::copy(&origin, &destination).map_err(|error| format!("复制示例文件失败: {error}"))?;
    copied += 1;
  }

  Ok(copied)
}

/// 准备示例文件夹，返回它的路径。
#[tauri::command(async)]
pub fn prepare_sample_folder(app: tauri::AppHandle) -> Result<String, String> {
  let source = app
    .path()
    .resolve("resources/sample", tauri::path::BaseDirectory::Resource)
    .map_err(|error| format!("定位示例文件失败: {error}"))?;

  let target: PathBuf = crate::settings::config_dir(&app).join(SAMPLE_FOLDER);

  copy_missing(&source, &target)?;

  Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(label: &str) -> PathBuf {
    let directory = std::env::temp_dir().join(format!("fuvideo-sample-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    directory
  }

  /// 造一个假的「安装目录」，里面放着示例文件。
  fn fake_resource(directory: &Path) {
    fs::create_dir_all(directory).expect("建资源目录");

    for name in SAMPLE_FILES {
      fs::write(directory.join(name), b"stub").expect("写示例文件");
    }
  }

  #[test]
  fn copies_every_file_the_first_time() {
    let source = temp_dir("copy-source");
    let target = temp_dir("copy-target");
    fake_resource(&source);

    let copied = copy_missing(&source, &target).expect("复制示例文件");

    assert_eq!(copied, SAMPLE_FILES.len());

    for name in SAMPLE_FILES {
      assert!(target.join(name).is_file(), "{name} 应该被复制过去");
    }

    let _ = fs::remove_dir_all(&source);
    let _ = fs::remove_dir_all(&target);
  }

  /// 点第二次不该把用户的东西覆盖掉：改过的字幕、拖过的进度都得留着。
  #[test]
  fn keeps_existing_files_and_only_fills_the_gaps() {
    let source = temp_dir("keep-source");
    let target = temp_dir("keep-target");
    fake_resource(&source);

    copy_missing(&source, &target).expect("第一次复制");

    let edited = target.join(SAMPLE_FILES[1]);
    fs::write(&edited, b"user edited").expect("模拟用户改过字幕");

    // 视频被删掉：这一次应该只补回它
    fs::remove_file(target.join(SAMPLE_FILES[0])).expect("删掉视频");

    let copied = copy_missing(&source, &target).expect("第二次复制");

    assert_eq!(copied, 1, "只该补回缺的那一个");
    assert_eq!(fs::read(&edited).expect("读回字幕"), b"user edited");
    assert!(target.join(SAMPLE_FILES[0]).is_file());

    let _ = fs::remove_dir_all(&source);
    let _ = fs::remove_dir_all(&target);
  }

  /// 打包漏了资源时必须报错，而不是给用户一个空文件夹。
  #[test]
  fn missing_resource_is_an_error() {
    let source = temp_dir("missing-source");
    let target = temp_dir("missing-target");
    fs::create_dir_all(&source).expect("建空资源目录");

    let outcome = copy_missing(&source, &target);

    assert!(outcome.is_err(), "资源不存在时不该静默通过");

    let _ = fs::remove_dir_all(&source);
    let _ = fs::remove_dir_all(&target);
  }

  /// 随包发布的这两个文件必须真的能用：视频要能播、要有音轨，
  /// 同名字幕要能自动加载——教程第二步之后全靠它。
  ///
  /// 跑在 `--vo=null --ao=null` 下，不出声也不开窗。
  #[test]
  fn shipped_sample_files_are_playable() {
    use crate::mpv::ipc;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/sample");

    for name in SAMPLE_FILES {
      let path = directory.join(name);
      assert!(path.is_file(), "随包的示例文件不见了: {}", path.display());
    }

    assert!(
      std::fs::metadata(directory.join(SAMPLE_FILES[0])).map(|meta| meta.len()).unwrap_or(0) > 10_000,
      "示例视频小得不像一个视频"
    );

    let Some(executable) = crate::mpv::find_mpv() else {
      eprintln!("本机未安装 mpv，跳过示例视频的集成测试");
      return;
    };

    let pipe = crate::mpv::next_pipe_name("test-sample");

    let mut child = Command::new(&executable)
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

    let client = ipc::connect_with_retry(&pipe, Duration::from_secs(20)).expect("连上 mpv 的 IPC 管道");

    client
      .load_file(&directory.join(SAMPLE_FILES[0]).to_string_lossy())
      .expect("载入示例视频");

    // 等轨道表出来：外挂字幕是自动加载的，可能要等文件解析完
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut kinds: Vec<String> = Vec::new();

    while Instant::now() < deadline {
      kinds = client
        .get_value("track-list")
        .ok()
        .flatten()
        .and_then(|value| {
          value.as_array().map(|items| {
            items
              .iter()
              .filter_map(|item| item.get("type").and_then(|kind| kind.as_str()).map(str::to_string))
              .collect()
          })
        })
        .unwrap_or_default();

      if kinds.iter().any(|kind| kind == "video") && kinds.iter().any(|kind| kind == "sub") {
        break;
      }

      std::thread::sleep(Duration::from_millis(100));
    }

    let _ = child.kill();

    assert!(kinds.iter().any(|kind| kind == "video"), "示例视频里应该有视频轨: {kinds:?}");
    assert!(kinds.iter().any(|kind| kind == "audio"), "示例视频里应该有音轨: {kinds:?}");
    assert!(
      kinds.iter().any(|kind| kind == "sub"),
      "同名字幕应该自动加载，教程后面的字幕那一步靠它: {kinds:?}"
    );
  }
}
