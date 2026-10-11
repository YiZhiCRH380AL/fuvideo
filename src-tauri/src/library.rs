//! 侧边栏的「选目录看视频」能力：挑目录、列出其中的视频文件。

use std::path::Path;

use serde::Serialize;

/// 能被侧边栏识别的视频扩展名。与文件选择框的过滤条件保持一致。
pub const VIDEO_EXTENSIONS: &[&str] = &[
  "mp4", "mkv", "mov", "avi", "webm", "flv", "ts", "m2ts", "mts", "wmv", "m4v", "mpg", "mpeg", "rmvb", "3gp", "ogv",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEntry {
  pub name: String,
  pub path: String,
}

/// 按扩展名判断是不是视频文件。
pub fn is_video_file(path: &Path) -> bool {
  path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(|extension| {
      VIDEO_EXTENSIONS
        .iter()
        .any(|known| known.eq_ignore_ascii_case(extension))
    })
    .unwrap_or(false)
}

/// 列出目录下的视频文件，按文件名排序（忽略大小写）。
pub fn list_videos_in(directory: &Path) -> Result<Vec<VideoEntry>, String> {
  let entries = std::fs::read_dir(directory).map_err(|error| format!("读取目录失败: {error}"))?;

  let mut videos: Vec<VideoEntry> = entries
    .filter_map(Result::ok)
    .map(|entry| entry.path())
    .filter(|path| path.is_file() && is_video_file(path))
    .map(|path| VideoEntry {
      name: path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default(),
      path: path.to_string_lossy().to_string(),
    })
    .collect();

  videos.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

  Ok(videos)
}

/// 弹出系统目录选择框；用户取消时返回 `None`。
#[tauri::command(async)]
pub fn pick_directory() -> Option<String> {
  rfd::FileDialog::new()
    .set_title("选择视频目录")
    .pick_folder()
    .map(|path| path.to_string_lossy().to_string())
}

/// 列出指定目录下的视频文件。
#[tauri::command(async)]
pub fn list_videos(directory: String) -> Result<Vec<VideoEntry>, String> {
  list_videos_in(Path::new(&directory))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn scratch_dir(name: &str) -> std::path::PathBuf {
    let directory = std::env::temp_dir().join(format!("fuvideo-library-{name}"));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir_all(&directory).expect("建立测试目录");
    directory
  }

  #[test]
  fn is_video_file_checks_extension_case_insensitively() {
    assert!(is_video_file(Path::new("a.mp4")));
    assert!(is_video_file(Path::new("a.MKV")));
    assert!(!is_video_file(Path::new("a.txt")));
    assert!(!is_video_file(Path::new("no-extension")));
  }

  #[test]
  fn lists_only_videos_sorted_by_name() {
    let directory = scratch_dir("sorted");

    for name in ["b.mp4", "A.mkv", "notes.txt", "cover.jpg", "c.MP4"] {
      std::fs::write(directory.join(name), b"stub").expect("写入测试文件");
    }

    let videos = list_videos_in(&directory).expect("列出视频");
    let names: Vec<&str> = videos.iter().map(|entry| entry.name.as_str()).collect();

    assert_eq!(names, vec!["A.mkv", "b.mp4", "c.MP4"]);

    let _ = std::fs::remove_dir_all(&directory);
  }

  #[test]
  fn ignores_subdirectories_even_if_they_look_like_videos() {
    let directory = scratch_dir("nested");
    std::fs::create_dir(directory.join("folder.mp4")).expect("建立同名子目录");
    std::fs::write(directory.join("real.mp4"), b"stub").expect("写入测试文件");

    let videos = list_videos_in(&directory).expect("列出视频");

    assert_eq!(videos.len(), 1);
    assert_eq!(videos[0].name, "real.mp4");

    let _ = std::fs::remove_dir_all(&directory);
  }

  #[test]
  fn reports_unreadable_directory() {
    let missing = std::env::temp_dir().join("fuvideo-library-definitely-missing");

    assert!(list_videos_in(&missing).is_err());
  }

  #[test]
  fn entries_serialize_camel_case() {
    let entry = VideoEntry {
      name: "a.mp4".to_string(),
      path: r"E:\a.mp4".to_string(),
    };

    let json = serde_json::to_value(entry).expect("序列化条目");

    assert!(json.get("name").is_some());
    assert!(json.get("path").is_some());
  }
}
