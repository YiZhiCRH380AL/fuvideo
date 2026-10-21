//! 播放列表与收藏夹。
//!
//! 两个东西都只是「一串路径」，但归属不同：播放列表是这一次想连着看的东西，
//! 看完会自动播下一个；收藏夹是长期想留着的，用来快速跳回那个目录。
//!
//! 存成应用配置目录下的 `collections.json`，**不和 `settings.json` 混在一起**：
//! 它们的写入时机差得远——设置是偶尔改一次，列表是点一下加一个视频就写一次。

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// 列表文件名。
pub const COLLECTIONS_FILE: &str = "collections.json";

/// 命名收藏夹上限：侧栏太长反而找不到东西。
pub const MAX_CUSTOM_COLLECTIONS: usize = 32;
/// 单个收藏夹名称的字符上限。
pub const MAX_COLLECTION_NAME_CHARS: usize = 40;

static COLLECTION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NamedCollection {
  pub id: String,
  pub name: String,
  pub paths: Vec<String>,
}

impl Default for NamedCollection {
  fn default() -> Self {
    Self {
      id: String::new(),
      name: String::new(),
      paths: Vec::new(),
    }
  }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Collections {
  /// 播放顺序就是数组顺序，看完一个自动播下一个。
  pub playlist: Vec<String>,
  pub favorites: Vec<String>,
  /// 用户自己命名、可建多个的长期收藏夹。
  pub custom_collections: Vec<NamedCollection>,
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
    self.custom_collections = normalize_collections(self.custom_collections);
    self
  }
}

fn normalized_name(name: &str) -> String {
  name.trim().chars().take(MAX_COLLECTION_NAME_CHARS).collect()
}

fn same_name(left: &str, right: &str) -> bool {
  left.eq_ignore_ascii_case(right)
}

fn normalize_collections(collections: Vec<NamedCollection>) -> Vec<NamedCollection> {
  let mut normalized = Vec::new();

  for collection in collections {
    let id = collection.id.trim().to_string();
    let name = normalized_name(&collection.name);

    if id.is_empty()
      || name.is_empty()
      || normalized
        .iter()
        .any(|item: &NamedCollection| item.id == id || same_name(&item.name, &name))
    {
      continue;
    }

    normalized.push(NamedCollection {
      id,
      name,
      paths: normalize(collection.paths),
    });

    if normalized.len() >= MAX_CUSTOM_COLLECTIONS {
      break;
    }
  }

  normalized
}

fn new_collection_id() -> String {
  let millis = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or_default();
  let sequence = COLLECTION_SEQUENCE.fetch_add(1, Ordering::Relaxed);

  format!("collection-{millis:x}-{sequence:x}")
}

fn collection_name(name: String) -> Result<String, String> {
  let name = normalized_name(&name);

  if name.is_empty() {
    return Err("收藏夹名称不能为空".to_string());
  }

  Ok(name)
}

fn create_named_collection(current: &mut Collections, name: String) -> Result<(), String> {
  let name = collection_name(name)?;

  if current.custom_collections.len() >= MAX_CUSTOM_COLLECTIONS {
    return Err(format!("最多只能建 {MAX_CUSTOM_COLLECTIONS} 个收藏夹"));
  }

  if current
    .custom_collections
    .iter()
    .any(|collection| same_name(&collection.name, &name))
  {
    return Err("已经有同名收藏夹了".to_string());
  }

  current.custom_collections.push(NamedCollection {
    id: new_collection_id(),
    name,
    paths: Vec::new(),
  });
  Ok(())
}

fn rename_named_collection(
  current: &mut Collections,
  id: &str,
  name: String,
) -> Result<(), String> {
  let name = collection_name(name)?;

  if current
    .custom_collections
    .iter()
    .any(|collection| collection.id != id && same_name(&collection.name, &name))
  {
    return Err("已经有同名收藏夹了".to_string());
  }

  let Some(collection) = current
    .custom_collections
    .iter_mut()
    .find(|collection| collection.id == id)
  else {
    return Err("找不到这个收藏夹".to_string());
  };

  collection.name = name;
  Ok(())
}

fn delete_named_collection(current: &mut Collections, id: &str) -> Result<(), String> {
  let before = current.custom_collections.len();
  current.custom_collections.retain(|collection| collection.id != id);

  if current.custom_collections.len() == before {
    return Err("找不到这个收藏夹".to_string());
  }

  Ok(())
}

fn toggle_in_named_collection(
  current: &mut Collections,
  id: &str,
  path: &str,
) -> Result<(), String> {
  let Some(collection) = current
    .custom_collections
    .iter_mut()
    .find(|collection| collection.id == id)
  else {
    return Err("找不到这个收藏夹".to_string());
  };

  toggle(&mut collection.paths, path);
  Ok(())
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

/// m3u8 的第一行。
const M3U8_HEADER: &str = "#EXTM3U";

/// 把一串路径写成 m3u8。
///
/// 不写 `#EXTINF`：那行要时长，而我们手里只有路径，m3u8 允许只有 `#EXTM3U` 加路径。
/// 路径统一成正斜杠——Windows 上的 mpv / VLC / 剪辑软件都认，别的平台也不会把
/// 反斜杠当成转义。
pub fn to_m3u8(paths: &[String]) -> String {
  let mut text = String::from(M3U8_HEADER);
  text.push('\n');

  for path in paths {
    text.push_str(&path.replace('\\', "/"));
    text.push('\n');
  }

  text
}

/// 解析 m3u8。
///
/// 相对路径按**列表文件所在目录**解析，这是 m3u8 的标准语义；`file://` 前缀去掉。
/// **不检查文件是否还存在**：列表是书签，文件暂时挪走了也不该在导入时被悄悄丢掉。
pub fn parse_m3u8(text: &str, directory: Option<&Path>) -> Vec<String> {
  let mut paths = Vec::new();

  for line in text.lines() {
    let line = line.trim();

    if line.is_empty() || line.starts_with('#') {
      continue;
    }

    let raw = strip_file_scheme(line);
    let path = Path::new(&raw);

    let resolved = if path.is_absolute() || raw.contains("://") {
      raw.to_string()
    } else if let Some(directory) = directory {
      directory.join(path).to_string_lossy().to_string()
    } else {
      raw.to_string()
    };

    paths.push(normalize_separators(resolved));
  }

  normalize(paths)
}

/// 把绝对 Windows 路径统一成反斜杠。
///
/// 相对路径拼到目录上之后会得到 `E:\clips\sub/b.mp4` 这种混着两种分隔符的结果：
/// 能用，但和列表里别的路径长得不一样，去重时会被当成两条。URIs 不动。
fn normalize_separators(path: String) -> String {
  if path.contains("://") {
    return path;
  }

  let absolute = path.as_bytes().get(1) == Some(&b':') || path.starts_with(r"\\");

  if absolute {
    path.replace('/', r"\")
  } else {
    path
  }
}

/// 去掉 `file://` 前缀并还原成 Windows 路径：
/// `file:///E:/a.mkv` → `E:/a.mkv`，`file://server/share/b.mp4` → `\\server\share\b.mp4`。
fn strip_file_scheme(line: &str) -> String {
  let Some(rest) = line.strip_prefix("file://") else {
    return line.to_string();
  };

  if let Some(without_slash) = rest.strip_prefix('/') {
    // 盘符形式（/E:/…）才去掉那个斜杠
    if without_slash.as_bytes().len() >= 2 && without_slash.as_bytes()[1] == b':' {
      return without_slash.to_string();
    }

    return rest.to_string();
  }

  // UNC：file://server/share/… → \\server\share\…
  format!(r"\\{}", rest.replace('/', r"\"))
}

/// 把导入的路径并进现有列表：已有的跳过，新的按顺序追加。
pub fn merge_playlist(existing: &[String], incoming: &[String]) -> Vec<String> {
  let mut merged = existing.to_vec();
  merged.extend(incoming.iter().cloned());

  normalize(merged)
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

/// 清空某一侧，另一侧不动。
fn clear_list(collections: &mut Collections, kind: &str) {
  if kind == "favorites" {
    collections.favorites.clear();
  } else {
    collections.playlist.clear();
  }
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

/// 新建一个可命名的收藏夹。
#[tauri::command]
pub fn create_collection(app: tauri::AppHandle, name: String) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);
  create_named_collection(&mut current, name)?;
  save(&directory, current)
}

/// 给收藏夹改名；只影响显示名，ID 和内容保持不变。
#[tauri::command]
pub fn rename_collection(
  app: tauri::AppHandle,
  id: String,
  name: String,
) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);
  rename_named_collection(&mut current, &id, name)?;
  save(&directory, current)
}

/// 删除一个命名收藏夹。
#[tauri::command]
pub fn delete_collection(app: tauri::AppHandle, id: String) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);
  delete_named_collection(&mut current, &id)?;
  save(&directory, current)
}

/// 加入 / 移出命名收藏夹；返回改完之后的全部收藏数据。
#[tauri::command]
pub fn toggle_named_collection(
  app: tauri::AppHandle,
  id: String,
  path: String,
) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);
  toggle_in_named_collection(&mut current, &id, &path)?;
  save(&directory, current)
}

/// 一键清空播放列表或收藏夹。另一侧不动。
#[tauri::command]
pub fn clear_collection(app: tauri::AppHandle, kind: String) -> Result<Collections, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);

  clear_list(&mut current, &kind);

  save(&directory, current)
}

/// 把播放列表或收藏夹导出成 m3u8。用户取消时返回 `None`。
#[tauri::command(async)]
pub fn export_collection(app: tauri::AppHandle, kind: String) -> Result<Option<String>, String> {
  let current = load(&config_dir(&app));

  let (paths, default_name) = match kind.as_str() {
    "favorites" => (current.favorites, "收藏夹.m3u8"),
    _ => (current.playlist, "播放列表.m3u8"),
  };

  if paths.is_empty() {
    return Err("列表是空的，没有可导出的内容".to_string());
  }

  let Some(target) = rfd::FileDialog::new()
    .set_title("导出列表")
    .set_file_name(default_name)
    .add_filter("M3U8 播放列表", &["m3u8"])
    .save_file()
  else {
    return Ok(None);
  };

  fs::write(&target, to_m3u8(&paths)).map_err(|error| format!("写入列表失败: {error}"))?;

  Ok(Some(target.to_string_lossy().to_string()))
}

/// 从一个 m3u8 导入：并进现有播放列表，返回改完之后的列表。用户取消时返回 `None`。
#[tauri::command(async)]
pub fn import_playlist(app: tauri::AppHandle) -> Result<Option<Collections>, String> {
  let Some(source) = rfd::FileDialog::new()
    .set_title("导入播放列表")
    .add_filter("M3U8 播放列表", &["m3u8", "m3u"])
    .pick_file()
  else {
    return Ok(None);
  };

  let text = fs::read_to_string(&source).map_err(|error| format!("读取列表失败: {error}"))?;
  let incoming = parse_m3u8(&text, source.parent());

  if incoming.is_empty() {
    return Err("这个文件里没有可用的路径".to_string());
  }

  let directory = config_dir(&app);
  let mut current = load(&directory);

  current.playlist = merge_playlist(&current.playlist, &incoming);

  save(&directory, current).map(Some)
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
      custom_collections: Vec::new(),
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
      custom_collections: vec![NamedCollection {
        id: "night".to_string(),
        name: "夜场".to_string(),
        paths: vec![r"E:\d.mkv".to_string()],
      }],
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

    for key in ["playlist", "favorites", "customCollections"] {
      assert!(value.get(key).is_some(), "列表里缺少字段 {key}");
    }
  }

  #[test]
  fn legacy_file_without_custom_collections_still_loads() {
    let directory = temp_dir("legacy");
    fs::create_dir_all(&directory).expect("建目录");
    fs::write(
      directory.join(COLLECTIONS_FILE),
      br#"{ "playlist": ["E:\\a.mkv"], "favorites": ["E:\\b.mkv"] }"#,
    )
    .expect("写旧文件");

    let loaded = load(&directory);

    assert_eq!(loaded.playlist, vec![r"E:\a.mkv"]);
    assert_eq!(loaded.favorites, vec![r"E:\b.mkv"]);
    assert!(loaded.custom_collections.is_empty());
  }

  #[test]
  fn named_collections_are_trimmed_deduped_and_limited() {
    let collections = Collections {
      playlist: Vec::new(),
      favorites: Vec::new(),
      custom_collections: vec![
        NamedCollection {
          id: "one".to_string(),
          name: "  夜场  ".to_string(),
          paths: vec![r"E:\a.mkv".to_string(), r"E:\a.mkv".to_string()],
        },
        NamedCollection {
          id: "two".to_string(),
          name: "夜场".to_string(),
          paths: Vec::new(),
        },
        NamedCollection {
          id: "three".to_string(),
          name: " ".to_string(),
          paths: Vec::new(),
        },
      ],
    }
    .normalized();

    assert_eq!(collections.custom_collections.len(), 1);
    assert_eq!(collections.custom_collections[0].name, "夜场");
    assert_eq!(collections.custom_collections[0].paths, vec![r"E:\a.mkv"]);
  }

  #[test]
  fn named_collection_lifecycle_keeps_ids_and_paths() {
    let mut collections = Collections::default();

    create_named_collection(&mut collections, "  夜场  ".to_string()).expect("建夜场");
    create_named_collection(&mut collections, "周末".to_string()).expect("建周末");
    assert_eq!(collections.custom_collections.len(), 2);
    assert_eq!(collections.custom_collections[0].name, "夜场");
    assert_ne!(
      collections.custom_collections[0].id,
      collections.custom_collections[1].id
    );
    assert!(create_named_collection(&mut collections, "夜场".to_string()).is_err());

    let id = collections.custom_collections[0].id.clone();
    toggle_in_named_collection(&mut collections, &id, r"E:\a.mkv").expect("加入");
    toggle_in_named_collection(&mut collections, &id, r"E:\a.mkv").expect("移出");
    assert!(collections.custom_collections[0].paths.is_empty());

    toggle_in_named_collection(&mut collections, &id, r"E:\b.mkv").expect("再加入");
    rename_named_collection(&mut collections, &id, "深夜".to_string()).expect("改名");
    assert_eq!(collections.custom_collections[0].name, "深夜");
    assert_eq!(collections.custom_collections[0].paths, vec![r"E:\b.mkv"]);

    delete_named_collection(&mut collections, &id).expect("删除");
    assert_eq!(collections.custom_collections.len(), 1);
    assert_eq!(collections.custom_collections[0].name, "周末");
  }

  #[test]
  fn named_collection_names_must_be_non_empty_and_unique() {
    let mut collections = Collections::default();

    assert!(create_named_collection(&mut collections, "   ".to_string()).is_err());
    create_named_collection(&mut collections, "Movie Night".to_string()).expect("建收藏夹");
    assert!(create_named_collection(&mut collections, "movie night".to_string()).is_err());

    let id = collections.custom_collections[0].id.clone();
    assert!(rename_named_collection(&mut collections, "missing", "X".to_string()).is_err());
    assert!(rename_named_collection(&mut collections, &id, " ".to_string()).is_err());
  }

  /* ---------------- m3u8 导出 / 导入 ---------------- */

  #[test]
  fn m3u8_export_writes_a_header_and_one_path_per_line() {
    let text = to_m3u8(&[r"E:\clips\a.mkv".to_string(), r"E:\clips\b.mp4".to_string()]);

    assert_eq!(text, "#EXTM3U\nE:/clips/a.mkv\nE:/clips/b.mp4\n");
  }

  #[test]
  fn m3u8_round_trip_keeps_order() {
    let paths = vec![r"E:\clips\b.mp4".to_string(), r"E:\clips\a.mkv".to_string()];
    let parsed = parse_m3u8(&to_m3u8(&paths), None);

    // 导出写正斜杠（跨平台），读回来统一成 Windows 的反斜杠
    assert_eq!(parsed, paths);
  }

  #[test]
  fn m3u8_import_skips_comments_and_blank_lines() {
    let text = "#EXTM3U\n#EXTINF:123,标题\n\nE:/clips/a.mkv\n  \n# 注释\nE:/clips/b.mp4\n";
    let parsed = parse_m3u8(text, None);

    assert_eq!(parsed, vec![r"E:\clips\a.mkv", r"E:\clips\b.mp4"]);
  }

  /// 相对路径按列表文件所在目录解析——这是 m3u8 的标准语义。
  #[test]
  fn m3u8_import_resolves_relative_paths_against_the_file() {
    let parsed = parse_m3u8("a.mkv\nsub/b.mp4\n", Some(Path::new(r"E:\clips")));

    assert_eq!(parsed, vec![r"E:\clips\a.mkv", r"E:\clips\sub\b.mp4"]);
  }

  #[test]
  fn m3u8_import_strips_the_file_scheme() {
    assert_eq!(
      parse_m3u8("file:///E:/clips/a.mkv\nfile://server/share/b.mp4\n", None),
      vec![r"E:\clips\a.mkv", r"\\server\share\b.mp4"]
    );
  }

  /// 重复项会导入两次，之后自动连播就在原地打转——这里一并清掉。
  #[test]
  fn m3u8_import_dedupes_within_the_file() {
    let parsed = parse_m3u8("E:/a.mkv\nE:/a.mkv\nE:/b.mp4\n", None);

    assert_eq!(parsed, vec![r"E:\a.mkv", r"E:\b.mp4"]);
  }

  #[test]
  fn merge_appends_only_new_paths() {
    let merged = merge_playlist(
      &[r"E:\a.mkv".to_string()],
      &[r"E:\a.mkv".to_string(), r"E:\b.mp4".to_string()],
    );

    assert_eq!(merged, vec![r"E:\a.mkv", r"E:\b.mp4"]);
  }

  /// 清空只动被点的那一侧：清播放列表不该把收藏夹也清掉。
  #[test]
  fn clearing_one_list_leaves_the_other_alone() {
    let mut collections = Collections {
      playlist: vec![r"E:\a.mkv".to_string()],
      favorites: vec![r"E:\b.mp4".to_string()],
      custom_collections: Vec::new(),
    };

    clear_list(&mut collections, "playlist");
    assert!(collections.playlist.is_empty());
    assert_eq!(collections.favorites, vec![r"E:\b.mp4"]);

    clear_list(&mut collections, "favorites");
    assert!(collections.favorites.is_empty());
  }
}
