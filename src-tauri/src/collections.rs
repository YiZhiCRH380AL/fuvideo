//! 播放列表与收藏夹。
//!
//! 两个东西都只是「一串路径」，但归属不同：播放列表是这一次想连着看的东西，
//! 看完会自动播下一个；收藏夹是长期想留着的，用来快速跳回那个目录。
//!
//! 存成应用配置目录下的 `collections.json`，**不和 `settings.json` 混在一起**：
//! 它们的写入时机差得远——设置是偶尔改一次，列表是点一下加一个视频就写一次。

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// 列表文件名。
pub const COLLECTIONS_FILE: &str = "collections.json";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Collections {
  /// 播放顺序就是数组顺序，看完一个自动播下一个。
  pub playlist: Vec<String>,
  pub favorites: Vec<String>,
}

/// 去掉空路径与重复项，保持原有顺序。
///
/// 这个文件是可以手改的，而「同一个视频在列表里出现两遍」会让自动连播原地打转。
fn normalize(paths: Vec<String>) -> Vec<String> {
  let mut normalized: Vec<String> = Vec::with_capacity(paths.len());

  for path in paths {
    let path = path.trim().to_string();

    if path.is_empty() || normalized.contains(&path) {
      continue;
    }

    normalized.push(path);
  }

  normalized
}

impl Collections {
  pub fn normalized(mut self) -> Self {
    self.playlist = normalize(self.playlist);
    self.favorites = normalize(self.favorites);
    self
  }
}

/// 读列表。文件不存在、读不动、内容是坏 JSON——一律当成空列表。
pub fn load(directory: &Path) -> Collections {
  match fs::read_to_string(directory.join(COLLECTIONS_FILE)) {
    Ok(text) => serde_json::from_str::<Collections>(&text).unwrap_or_default().normalized(),
    Err(_) => Collections::default(),
  }
}

/// 写列表，返回归一化之后真正落盘的那份。
pub fn save(directory: &Path, collections: Collections) -> Result<Collections, String> {
  let normalized = collections.normalized();

  fs::create_dir_all(directory).map_err(|error| format!("创建配置目录失败: {error}"))?;

  let text = serde_json::to_string_pretty(&normalized)
    .map_err(|error| format!("序列化列表失败: {error}"))?;

  fs::write(directory.join(COLLECTIONS_FILE), text).map_err(|error| format!("写入列表失败: {error}"))?;

  Ok(normalized)
}

/// 加进列表；已经在里面就移出去。
///
/// 界面上那颗按钮是开关：鼠标移到方格上，加过一次之后再点是移出。
fn toggle(paths: &mut Vec<String>, path: &str) {
  match paths.iter().position(|item| item == path) {
    Some(index) => {
      paths.remove(index);
    }
    None => paths.push(path.to_string()),
  }
}

/// 在列表里挪一格。`delta` 为负是往上，到边界就不动。
fn shift(paths: &mut [String], path: &str, delta: i32) {
  let Some(index) = paths.iter().position(|item| item == path) else {
    return;
  };

  let target = index as i32 + delta;

  if target < 0 || target >= paths.len() as i32 {
    return;
  }

  paths.swap(index, target as usize);
}

fn config_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
  crate::settings::config_dir(app)
}

/// 读播放列表与收藏夹。
#[tauri::command]
pub fn read_collections(app: tauri::AppHandle) -> Collections {
  load(&config_dir(&app))
}

/// 把视频加进播放列表；已经在里面就移出。返回改完之后的列表。
#[tauri::command]
pub fn toggle_playlist(app: tauri::AppHandle, path: String) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);

  toggle(&mut current.playlist, &path);
  save(&directory, current)
}

/// 在播放列表里把某个视频上移或下移一格。
#[tauri::command]
pub fn shift_in_playlist(
  app: tauri::AppHandle,
  path: String,
  delta: i32,
) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);

  shift(&mut current.playlist, &path, delta);
  save(&directory, current)
}

/// 收藏 / 取消收藏某个视频。返回改完之后的列表。
#[tauri::command]
pub fn toggle_favorite(app: tauri::AppHandle, path: String) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);

  toggle(&mut current.favorites, &path);
  save(&directory, current)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(label: &str) -> std::path::PathBuf {
    let directory =
      std::env::temp_dir().join(format!("fuvideo-collections-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    directory
  }

  #[test]
  fn missing_file_means_empty_lists() {
    assert_eq!(load(&temp_dir("missing")), Collections::default());
  }

  #[test]
  fn broken_json_falls_back_to_empty() {
    let directory = temp_dir("broken");
    fs::create_dir_all(&directory).expect("建目录");
    fs::write(directory.join(COLLECTIONS_FILE), b"{ nope").expect("写坏文件");

    assert_eq!(load(&directory), Collections::default());
  }

  /// 手改出来的空行和重复项都要清掉：重复项会让自动连播原地打转。
  #[test]
  fn normalize_drops_blanks_and_duplicates() {
    let collections = Collections {
      playlist: vec![
        "  ".to_string(),
        r"E:\a.mkv".to_string(),
        r"E:\a.mkv".to_string(),
        r"E:\b.mkv".to_string(),
      ],
      favorites: vec![r"E:\a.mkv".to_string()],
    }
    .normalized();

    assert_eq!(collections.playlist, vec![r"E:\a.mkv", r"E:\b.mkv"]);
    assert_eq!(collections.favorites, vec![r"E:\a.mkv"]);
  }

  #[test]
  fn toggle_adds_then_removes() {
    let mut paths = vec![r"E:\a.mkv".to_string()];

    toggle(&mut paths, r"E:\b.mkv");
    assert_eq!(paths, vec![r"E:\a.mkv", r"E:\b.mkv"]);

    toggle(&mut paths, r"E:\a.mkv");
    assert_eq!(paths, vec![r"E:\b.mkv"]);
  }

  #[test]
  fn shift_moves_one_step_and_stops_at_the_edges() {
    let mut paths = vec![
      r"E:\a.mkv".to_string(),
      r"E:\b.mkv".to_string(),
      r"E:\c.mkv".to_string(),
    ];

    shift(&mut paths, r"E:\b.mkv", -1);
    assert_eq!(paths, vec![r"E:\b.mkv", r"E:\a.mkv", r"E:\c.mkv"]);

    // 已经在最前面，再往上不动
    shift(&mut paths, r"E:\b.mkv", -1);
    assert_eq!(paths[0], r"E:\b.mkv");

    // 已经在最后面，再往下不动
    shift(&mut paths, r"E:\c.mkv", 1);
    assert_eq!(paths[2], r"E:\c.mkv");

    // 不在列表里的路径是空操作
    shift(&mut paths, r"E:\nope.mkv", 1);
    assert_eq!(paths.len(), 3);
  }

  #[test]
  fn saved_lists_survive_a_round_trip() {
    let directory = temp_dir("round-trip");
    let collections = Collections {
      playlist: vec![r"E:\a.mkv".to_string(), r"E:\b.mkv".to_string()],
      favorites: vec![r"E:\c.mkv".to_string()],
    };

    let written = save(&directory, collections.clone()).expect("写入列表");

    assert_eq!(written, collections);
    assert_eq!(load(&directory), collections);

    let _ = fs::remove_dir_all(&directory);
  }

  /// 前端按 camelCase 读字段，名字对不上界面会静默拿到 undefined。
  #[test]
  fn collections_serialize_camel_case_fields() {
    let value = serde_json::to_value(Collections::default()).expect("序列化列表");

    for key in ["playlist", "favorites"] {
      assert!(value.get(key).is_some(), "列表里缺少字段 {key}");
    }
  }
}
