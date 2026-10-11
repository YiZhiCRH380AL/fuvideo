//! 目录浏览能力：挑目录、列出盘符、列出目录里的子目录与视频文件、进入子目录。

use std::path::Path;

use serde::Serialize;

/// 能被识别为视频的扩展名。与文件选择框的过滤条件保持一致。
pub const VIDEO_EXTENSIONS: &[&str] = &[
  "mp4", "mkv", "mov", "avi", "webm", "flv", "ts", "m2ts", "mts", "wmv", "m4v", "mpg", "mpeg", "rmvb", "3gp", "ogv",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowseKind {
  Directory,
  Video,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseEntry {
  pub name: String,
  pub path: String,
  pub kind: BrowseKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
  pub directory: String,
  /// 上一级目录；已经在盘符根目录时为 null。
  pub parent: Option<String>,
  pub entries: Vec<BrowseEntry>,
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

fn by_name(left: &BrowseEntry, right: &BrowseEntry) -> std::cmp::Ordering {
  left.name.to_lowercase().cmp(&right.name.to_lowercase())
}

/// 列出一个目录：子目录排在前面，其后是视频文件，各自按名称排序。
pub fn listing_for(directory: &Path) -> Result<DirectoryListing, String> {
  let read = std::fs::read_dir(directory).map_err(|error| format!("读取目录失败: {error}"))?;

  let mut directories = Vec::new();
  let mut videos = Vec::new();

  for entry in read.filter_map(Result::ok) {
    let path = entry.path();

    let Some(name) = path.file_name().map(|name| name.to_string_lossy().to_string()) else {
      continue;
    };

    let is_directory = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);

    if is_directory {
      directories.push(BrowseEntry {
        name,
        path: path.to_string_lossy().to_string(),
        kind: BrowseKind::Directory,
      });
    } else if is_video_file(&path) {
      videos.push(BrowseEntry {
        name,
        path: path.to_string_lossy().to_string(),
        kind: BrowseKind::Video,
      });
    }
  }

  directories.sort_by(by_name);
  videos.sort_by(by_name);
  directories.extend(videos);

  Ok(DirectoryListing {
    directory: directory.to_string_lossy().to_string(),
    parent: directory.parent().map(|parent| parent.to_string_lossy().to_string()),
    entries: directories,
  })
}

/// 弹出系统目录选择框；用户取消时返回 `None`。
#[tauri::command(async)]
pub fn pick_directory() -> Option<String> {
  rfd::FileDialog::new()
    .set_title("选择视频目录")
    .pick_folder()
    .map(|path| path.to_string_lossy().to_string())
}

/// 顶层入口：Windows 上是各个能进的盘符（`C:\`、`D:\`…）。
///
/// 判断方式是「能不能读」，而不是查系统盘符表：空的光驱、没插卡的读卡器
/// 同样会出现在盘符表里，点进去只会报错，不如干脆不列出来。
pub fn available_drives() -> Vec<String> {
  if cfg!(windows) {
    (b'A'..=b'Z')
      .map(|letter| format!("{}:\\", letter as char))
      .filter(|root| std::fs::read_dir(root).is_ok())
      .collect()
  } else {
    vec!["/".to_string()]
  }
}

/// 列出可以进去的顶层入口。盘符根目录再往上就是这里，不然换不了盘。
#[tauri::command(async)]
pub fn list_drives() -> Vec<String> {
  available_drives()
}

/// 列出指定目录下的子目录与视频文件。
#[tauri::command(async)]
pub fn list_directory(directory: String) -> Result<DirectoryListing, String> {
  listing_for(Path::new(&directory))
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
  fn lists_subdirectories_before_videos_sorted_by_name() {
    let directory = scratch_dir("order");

    std::fs::create_dir(directory.join("z-folder")).expect("建立子目录");
    std::fs::create_dir(directory.join("A-folder")).expect("建立子目录");
    std::fs::write(directory.join("b.mp4"), b"stub").expect("写入视频");
    std::fs::write(directory.join("a.mkv"), b"stub").expect("写入视频");
    std::fs::write(directory.join("notes.txt"), b"stub").expect("写入文本");

    let listing = listing_for(&directory).expect("列出目录");
    let names: Vec<&str> = listing.entries.iter().map(|entry| entry.name.as_str()).collect();

    assert_eq!(names, vec!["A-folder", "z-folder", "a.mkv", "b.mp4"]);
    assert_eq!(listing.entries[0].kind, BrowseKind::Directory);
    assert_eq!(listing.entries[2].kind, BrowseKind::Video);

    let _ = std::fs::remove_dir_all(&directory);
  }

  #[test]
  fn reports_parent_directory_for_navigation() {
    let directory = scratch_dir("parent");
    let child = directory.join("child");
    std::fs::create_dir(&child).expect("建立子目录");

    let listing = listing_for(&child).expect("列出子目录");
    let expected = directory.to_string_lossy().to_string();

    assert_eq!(listing.parent, Some(expected));

    let _ = std::fs::remove_dir_all(&directory);
  }

  #[test]
  fn skips_files_that_are_not_videos() {
    let directory = scratch_dir("filter");
    std::fs::write(directory.join("cover.jpg"), b"stub").expect("写入图片");
    std::fs::write(directory.join("real.mp4"), b"stub").expect("写入视频");

    let listing = listing_for(&directory).expect("列出目录");

    assert_eq!(listing.entries.len(), 1);
    assert_eq!(listing.entries[0].name, "real.mp4");

    let _ = std::fs::remove_dir_all(&directory);
  }

  #[test]
  fn reports_unreadable_directory() {
    let missing = std::env::temp_dir().join("fuvideo-library-definitely-missing");

    assert!(listing_for(&missing).is_err());
  }

  #[test]
  fn available_drives_are_roots_that_can_actually_be_listed() {
    let drives = available_drives();

    assert!(!drives.is_empty(), "至少应该有一个能读的顶层入口");

    for drive in &drives {
      assert!(
        drive.ends_with(":\\") || drive == "/",
        "{drive} 看起来不像顶层入口"
      );
      assert!(
        listing_for(Path::new(drive)).is_ok(),
        "{drive} 列不出来就不该出现在清单里"
      );
    }
  }

  #[test]
  fn listing_serializes_camel_case() {
    let listing = DirectoryListing {
      directory: r"E:\clips".to_string(),
      parent: None,
      entries: vec![BrowseEntry {
        name: "a".to_string(),
        path: r"E:\clips\a".to_string(),
        kind: BrowseKind::Video,
      }],
    };

    let json = serde_json::to_value(listing).expect("序列化目录列表");

    assert!(json.get("directory").is_some());
    assert!(json.get("parent").is_some());
    assert!(json.get("entries").is_some());
    assert_eq!(json["entries"][0]["kind"], serde_json::json!("video"));
  }
}
