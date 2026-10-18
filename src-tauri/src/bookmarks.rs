//! 书签：片子里的时间点标记。
//!
//! mpv 没有这个能力，是应用层自己存的一份「哪部片子的第几秒值得回来」。
//! 和 `recent.json`（最近看过哪几部）、`collections.json`（手动攒的列表）分开放：
//! 书签是「文件 + 时间点」的组合，和那两份的粒度不一样。

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const BOOKMARKS_FILE: &str = "bookmarks.json";

/// 最多留这么多条。一份书签文件不该无限长。
pub const BOOKMARK_LIMIT: usize = 500;

/// 判断「同一个时间点」的容差：连点两下「加书签」不该出两条。
const SAME_SPOT_SECONDS: f64 = 0.5;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Bookmark {
  pub path: String,
  /// 时间点，秒。
  pub position: f64,
  /// 打标记的时刻（Unix 秒），只用来排先后。
  pub created_at: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Bookmarks {
  pub entries: Vec<Bookmark>,
}

/// 洗一遍：丢掉空路径与坏位置，同一部片子的同一时间点只留一条。
///
/// 结果按「路径 → 时间点」升序：同一个文件的书签摆在一起、按片内时间从早到晚，
/// 正好是界面上要的顺序。
pub fn normalize(entries: Vec<Bookmark>) -> Vec<Bookmark> {
  let mut cleaned: Vec<Bookmark> = Vec::new();

  for entry in entries {
    let path = entry.path.trim().to_string();

    if path.is_empty() || !entry.position.is_finite() || entry.position < 0.0 {
      continue;
    }

    let duplicate = cleaned.iter().any(|kept| {
      kept.path == path && (kept.position - entry.position).abs() < SAME_SPOT_SECONDS
    });

    if duplicate {
      continue;
    }

    cleaned.push(Bookmark {
      path,
      position: entry.position,
      created_at: entry.created_at,
    });
  }

  cleaned.sort_by(|left, right| {
    left
      .path
      .cmp(&right.path)
      .then(left.position.partial_cmp(&right.position).unwrap_or(std::cmp::Ordering::Equal))
  });
  cleaned.truncate(BOOKMARK_LIMIT);

  cleaned
}

/// 在某个时间点加一条书签。
pub fn add(entries: &mut Vec<Bookmark>, path: &str, position: f64, now: u64) {
  if path.trim().is_empty() {
    return;
  }

  entries.push(Bookmark {
    path: path.trim().to_string(),
    position,
    created_at: now,
  });

  *entries = normalize(std::mem::take(entries));
}

/// 去掉某个文件在某个时间点的那条书签。不在里面就是空操作。
pub fn remove(entries: &mut Vec<Bookmark>, path: &str, position: f64) {
  entries.retain(|entry| {
    !(entry.path == path.trim() && (entry.position - position).abs() < SAME_SPOT_SECONDS)
  });
}

/// 解析书签。坏 JSON 一律当空，不让一个坏文件把面板挡住。
pub fn parse(text: &str) -> Bookmarks {
  match serde_json::from_str::<Bookmarks>(text) {
    Ok(bookmarks) => Bookmarks {
      entries: normalize(bookmarks.entries),
    },
    Err(_) => Bookmarks::default(),
  }
}

pub fn load(directory: &Path) -> Bookmarks {
  match fs::read_to_string(directory.join(BOOKMARKS_FILE)) {
    Ok(text) => parse(&text),
    Err(_) => Bookmarks::default(),
  }
}

/// 写书签，返回归一化之后真正落盘的那份。
pub fn save(directory: &Path, bookmarks: Bookmarks) -> Result<Bookmarks, String> {
  let normalized = Bookmarks {
    entries: normalize(bookmarks.entries),
  };

  fs::create_dir_all(directory).map_err(|error| format!("创建配置目录失败: {error}"))?;

  let text = serde_json::to_string_pretty(&normalized)
    .map_err(|error| format!("序列化书签失败: {error}"))?;

  fs::write(directory.join(BOOKMARKS_FILE), text).map_err(|error| format!("写入书签失败: {error}"))?;

  Ok(normalized)
}

fn now_seconds() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|elapsed| elapsed.as_secs())
    .unwrap_or(0)
}

/// 读书签。面板打开时拉一次。
#[tauri::command]
pub fn read_bookmarks(app: tauri::AppHandle) -> Bookmarks {
  load(&crate::settings::config_dir(&app))
}

/// 在当前位置加一条书签，返回改完之后的整份。
#[tauri::command]
pub fn add_bookmark(
  app: tauri::AppHandle,
  path: String,
  position: f64,
) -> Result<Bookmarks, String> {
  let directory = crate::settings::config_dir(&app);
  let mut current = load(&directory);

  add(&mut current.entries, &path, position, now_seconds());

  save(&directory, current)
}

/// 去掉某个文件在某个时间点的那条书签。
#[tauri::command]
pub fn remove_bookmark(
  app: tauri::AppHandle,
  path: String,
  position: f64,
) -> Result<Bookmarks, String> {
  let directory = crate::settings::config_dir(&app);
  let mut current = load(&directory);

  remove(&mut current.entries, &path, position);

  save(&directory, current)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(label: &str) -> std::path::PathBuf {
    let directory =
      std::env::temp_dir().join(format!("fuvideo-bookmarks-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    directory
  }

  fn entry(path: &str, position: f64, created_at: u64) -> Bookmark {
    Bookmark {
      path: path.to_string(),
      position,
      created_at,
    }
  }

  #[test]
  fn missing_file_means_no_bookmarks() {
    assert_eq!(load(&temp_dir("missing")), Bookmarks::default());
  }

  #[test]
  fn broken_json_falls_back_to_empty() {
    assert_eq!(parse("{ nope"), Bookmarks::default());
  }

  /// 同一部片子的书签按时间点从早到晚；不同文件的分开摆。
  #[test]
  fn normalize_sorts_by_path_then_position() {
    let entries = normalize(vec![
      entry(r"E:\b.mp4", 5.0, 1),
      entry(r"E:\a.mkv", 90.0, 2),
      entry(r"E:\a.mkv", 12.0, 3),
    ]);

    assert_eq!(
      entries
        .iter()
        .map(|item| (item.path.as_str(), item.position))
        .collect::<Vec<_>>(),
      vec![(r"E:\a.mkv", 12.0), (r"E:\a.mkv", 90.0), (r"E:\b.mp4", 5.0)]
    );
  }

  /// 连点两下「加书签」不该出两条。
  #[test]
  fn normalize_dedupes_the_same_spot() {
    let entries = normalize(vec![
      entry(r"E:\a.mkv", 10.0, 1),
      entry(r"E:\a.mkv", 10.2, 2),
      entry(r"E:\a.mkv", 11.0, 3),
    ]);

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].position, 10.0);
    assert_eq!(entries[1].position, 11.0);
  }

  #[test]
  fn normalize_drops_blank_paths_and_bad_positions() {
    let entries = normalize(vec![
      entry("   ", 10.0, 1),
      entry(r"E:\a.mkv", f64::NAN, 2),
      entry(r"E:\a.mkv", -3.0, 3),
    ]);

    assert!(entries.is_empty());
  }

  #[test]
  fn add_puts_the_new_bookmark_in_place() {
    let mut entries = vec![entry(r"E:\a.mkv", 90.0, 1)];

    add(&mut entries, r"E:\a.mkv", 12.0, 2);

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].position, 12.0);
    assert_eq!(entries[1].position, 90.0);
  }

  /// 只去掉点名的那一条：同一部片子别的书签要留着。
  #[test]
  fn remove_takes_only_the_named_spot() {
    let mut entries = vec![
      entry(r"E:\a.mkv", 12.0, 1),
      entry(r"E:\a.mkv", 90.0, 2),
    ];

    remove(&mut entries, r"E:\a.mkv", 12.2);

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].position, 90.0);
  }

  #[test]
  fn removing_something_absent_changes_nothing() {
    let mut entries = vec![entry(r"E:\a.mkv", 12.0, 1)];

    remove(&mut entries, r"E:\a.mkv", 40.0);

    assert_eq!(entries.len(), 1);
  }

  #[test]
  fn saved_bookmarks_survive_a_round_trip() {
    let directory = temp_dir("round-trip");
    let bookmarks = Bookmarks {
      entries: vec![entry(r"E:\a.mkv", 12.5, 100)],
    };

    let written = save(&directory, bookmarks.clone()).expect("写入");

    assert_eq!(written, bookmarks);
    assert_eq!(load(&directory), bookmarks);

    let _ = fs::remove_dir_all(&directory);
  }

  /// 前端按 camelCase 读字段，名字对不上界面会静默拿到 undefined。
  #[test]
  fn bookmarks_serialize_camel_case_fields() {
    let value = serde_json::to_value(Bookmarks {
      entries: vec![entry(r"E:\a.mkv", 12.5, 100)],
    })
    .expect("序列化");

    let first = &value["entries"][0];

    for key in ["path", "position", "createdAt"] {
      assert!(first.get(key).is_some(), "书签里缺少字段 {key}");
    }
  }
}
