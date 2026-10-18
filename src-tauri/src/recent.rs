//! 最近播放记录。
//!
//! 和 mpv 自己的 watch-later 分工不同：
//! - watch-later 管「同一部片子下次从哪儿接着放」，由 mpv 写在它自己的目录里；
//! - 这里只管「最近看过哪几部、各自停在哪一秒」，给播放工具面板列一份入口。
//!
//! 存在配置目录下的 `recent.json`，和 `collections.json` 分开放：这份是播放行为
//! 自动写出来的，和用户手动加的播放列表不是一回事。

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const RECENT_FILE: &str = "recent.json";

/// 最多留这么多条。再多面板里也翻不动，文件也会一直涨。
pub const RECENT_LIMIT: usize = 20;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RecentEntry {
  pub path: String,
  /// 最后播放的时刻（Unix 秒），用来排序。
  pub played_at: u64,
  /// 停在哪一秒。续播本身还是交给 watch-later，这里只用来显示。
  pub position: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Recent {
  pub entries: Vec<RecentEntry>,
}

/// 洗一遍：按时间倒序、按路径去重、砍到上限。
///
/// 手改文件或者系统时钟回拨都可能让顺序乱掉；同一条路径只留**最新**那条，
/// 位置和时刻都取新的。
pub fn normalize(mut entries: Vec<RecentEntry>) -> Vec<RecentEntry> {
  // 稳定排序：同一秒写进去的两条保持原有先后
  entries.sort_by(|left, right| right.played_at.cmp(&left.played_at));

  let mut seen: Vec<String> = Vec::new();
  let mut normalized = Vec::new();

  for entry in entries {
    let path = entry.path.trim().to_string();

    if path.is_empty() || seen.contains(&path) {
      continue;
    }

    seen.push(path.clone());
    normalized.push(RecentEntry {
      path,
      played_at: entry.played_at,
      position: usable_position(entry.position),
    });
  }

  normalized.truncate(RECENT_LIMIT);
  normalized
}

/// 位置只认有限的正数；NaN 与负数一律当 0（「从头开始」）。
fn usable_position(position: f64) -> f64 {
  if position.is_finite() && position > 0.0 {
    position
  } else {
    0.0
  }
}

/// 记一次播放：把这条挪到最前面，更新位置与时刻。
pub fn touch(entries: &mut Vec<RecentEntry>, path: &str, position: f64, now: u64) {
  let path = path.trim();

  if path.is_empty() {
    return;
  }

  entries.retain(|entry| entry.path != path);
  entries.push(RecentEntry {
    path: path.to_string(),
    played_at: now,
    position: usable_position(position),
  });

  *entries = normalize(std::mem::take(entries));
}

/// 解析最近播放。坏 JSON 一律当空，不让一个坏文件把面板挡住。
pub fn parse(text: &str) -> Recent {
  match serde_json::from_str::<Recent>(text) {
    Ok(recent) => Recent {
      entries: normalize(recent.entries),
    },
    Err(_) => Recent::default(),
  }
}

pub fn load(directory: &Path) -> Recent {
  match fs::read_to_string(directory.join(RECENT_FILE)) {
    Ok(text) => parse(&text),
    Err(_) => Recent::default(),
  }
}

/// 写最近播放，返回归一化之后真正落盘的那份。
pub fn save(directory: &Path, recent: Recent) -> Result<Recent, String> {
  let normalized = Recent {
    entries: normalize(recent.entries),
  };

  fs::create_dir_all(directory).map_err(|error| format!("创建配置目录失败: {error}"))?;

  let text = serde_json::to_string_pretty(&normalized)
    .map_err(|error| format!("序列化最近播放失败: {error}"))?;

  fs::write(directory.join(RECENT_FILE), text).map_err(|error| format!("写入最近播放失败: {error}"))?;

  Ok(normalized)
}

/// 记一次播放并落盘。
///
/// 调用方可以放心忽略错误：这是附带的记录，不能因为它挡住播放本身。
pub fn remember(directory: &Path, path: &str, position: f64) -> Result<Recent, String> {
  let mut current = load(directory);

  touch(&mut current.entries, path, position, now_seconds());

  save(directory, current)
}

fn now_seconds() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|elapsed| elapsed.as_secs())
    .unwrap_or(0)
}

/// 读最近播放。面板打开时拉一次。
#[tauri::command]
pub fn read_recent(app: tauri::AppHandle) -> Recent {
  load(&crate::settings::config_dir(&app))
}

/// 清空最近播放。
#[tauri::command]
pub fn clear_recent(app: tauri::AppHandle) -> Result<Recent, String> {
  save(&crate::settings::config_dir(&app), Recent::default())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(label: &str) -> std::path::PathBuf {
    let directory =
      std::env::temp_dir().join(format!("fuvideo-recent-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    directory
  }

  fn entry(path: &str, played_at: u64, position: f64) -> RecentEntry {
    RecentEntry {
      path: path.to_string(),
      played_at,
      position,
    }
  }

  #[test]
  fn missing_file_means_an_empty_list() {
    assert_eq!(load(&temp_dir("missing")), Recent::default());
  }

  #[test]
  fn broken_json_falls_back_to_empty() {
    assert_eq!(parse("{ nope"), Recent::default());
  }

  /// 刚看过的排最前面，同一条不会出现两次。
  #[test]
  fn touch_moves_to_the_front_and_updates_progress() {
    let mut entries = vec![entry(r"E:\a.mkv", 100, 30.0), entry(r"E:\b.mp4", 200, 10.0)];

    touch(&mut entries, r"E:\a.mkv", 95.0, 300);

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].path, r"E:\a.mkv");
    assert_eq!(entries[0].position, 95.0);
    assert_eq!(entries[0].played_at, 300);
    assert_eq!(entries[1].path, r"E:\b.mp4");
  }

  /// 读文件时顺序可能是乱的、也可能有重复：按时间排、同路径留最新。
  #[test]
  fn normalize_sorts_and_keeps_the_newest_of_each_path() {
    let entries = normalize(vec![
      entry(r"E:\a.mkv", 100, 10.0),
      entry(r"E:\b.mp4", 300, 20.0),
      entry(r"E:\a.mkv", 200, 30.0),
    ]);

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].path, r"E:\b.mp4");
    assert_eq!(entries[1].path, r"E:\a.mkv");
    assert_eq!(entries[1].position, 30.0, "同一条路径要留新的那份进度");
  }

  #[test]
  fn normalize_truncates_to_the_limit() {
    let entries: Vec<RecentEntry> = (0..RECENT_LIMIT + 5)
      .map(|index| entry(&format!(r"E:\{index}.mkv"), index as u64, 0.0))
      .collect();

    let normalized = normalize(entries);

    assert_eq!(normalized.len(), RECENT_LIMIT);
    // 时间最大（最后放的）那条在最前面
    assert_eq!(normalized[0].path, format!(r"E:\{}.mkv", RECENT_LIMIT + 4));
  }

  #[test]
  fn blank_paths_and_bad_positions_are_dropped_or_zeroed() {
    let entries = normalize(vec![
      entry("   ", 300, 10.0),
      entry(r"E:\a.mkv", 200, f64::NAN),
      entry(r"E:\b.mkv", 100, -5.0),
    ]);

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].position, 0.0, "NaN 当从头开始");
    assert_eq!(entries[1].position, 0.0, "负数当从头开始");
  }

  #[test]
  fn saved_recent_survives_a_round_trip() {
    let directory = temp_dir("round-trip");
    let recent = Recent {
      entries: vec![entry(r"E:\a.mkv", 100, 12.5)],
    };

    let written = save(&directory, recent.clone()).expect("写入");

    assert_eq!(written, recent);
    assert_eq!(load(&directory), recent);

    let _ = fs::remove_dir_all(&directory);
  }

  /// 前端按 camelCase 读字段，名字对不上界面会静默拿到 undefined。
  #[test]
  fn recent_serializes_camel_case_fields() {
    let value = serde_json::to_value(Recent {
      entries: vec![entry(r"E:\a.mkv", 100, 12.5)],
    })
    .expect("序列化");

    let first = &value["entries"][0];

    for key in ["path", "playedAt", "position"] {
      assert!(first.get(key).is_some(), "最近播放里缺少字段 {key}");
    }
  }

  #[test]
  fn remember_writes_through_load_and_touch() {
    let directory = temp_dir("remember");

    remember(&directory, r"E:\a.mkv", 5.0).expect("第一次记");
    let recent = remember(&directory, r"E:\a.mkv", 42.0).expect("第二次记");

    assert_eq!(recent.entries.len(), 1);
    assert_eq!(recent.entries[0].position, 42.0);
    assert_eq!(load(&directory).entries[0].position, 42.0);

    let _ = fs::remove_dir_all(&directory);
  }
}
