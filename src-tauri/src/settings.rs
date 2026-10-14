//! 全局偏好设置。
//!
//! 目前只有播放相关的几项，存在应用配置目录下的 `settings.json`。设置面板还没做，
//! 但这些值从这一刻起就会注入 mpv 的启动参数，所以后面接面板时不用再动播放链路。
//!
//! 约定：**默认值等于 mpv 默认行为的项一律写成 `Option`**，`None` 就完全不传这个参数。
//! 这样「没设置过」和「设置成 mpv 的默认值」不会互相污染，开箱行为也跟加设置之前一模一样。

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 设置文件名。放在应用配置目录（`%APPDATA%\<bundle identifier>`）下。
pub const SETTINGS_FILE: &str = "settings.json";

/// 允许的硬解模式，取值和 mpv 的 `--hwdec` 一致，只放开常用的几个。
pub const HWDEC_MODES: &[&str] = &["auto-safe", "auto", "d3d11va", "nvdec", "amf", "no"];

/// 允许的字幕自动加载模式，对应 mpv 的 `--sub-auto`。
pub const SUB_AUTO_MODES: &[&str] = &["no", "exact", "fuzzy", "all"];

/// 允许的声道布局，对应 mpv 的 `--audio-channels`。
pub const AUDIO_CHANNELS: &[&str] = &["auto-safe", "auto", "mono", "stereo", "2.1", "5.1", "7.1"];

/// 允许的 ASS 字幕样式覆盖模式，对应 mpv 的 `--sub-ass-override`。
pub const SUB_ASS_OVERRIDE_MODES: &[&str] = &["no", "yes", "scale", "force", "strip"];

/// 设置的呈现模式：简单只给几个常用项，高级把细调都摆出来。音频和画面共用这一套。
pub const FILTER_MODES: &[&str] = &["simple", "advanced"];

/// 允许的输出位深。`None` 表示跟随源。
pub const AUDIO_FORMATS: &[&str] = &["s16", "s32", "float"];

/// 均衡器的频段数。10 段是图形均衡器的常见规格，界面上正好一排能放下。
pub const EQUALIZER_BANDS: usize = 10;

/// 单个频段的增益上限（dB），和 [crate::audio] 保持一致。
const EQUALIZER_GAIN_LIMIT: f64 = 12.0;

/// 采样率上限，跟 mpv 的 `--audio-samplerate` 对齐。
const SAMPLERATE_LIMIT: u32 = 768_000;

/// 允许的画面比例档位，对应 `--video-aspect-override`。见 [crate::video::aspect_value]。
pub const ASPECT_MODES: &[&str] = &["auto", "window", "16:9", "4:3", "21:9", "1:1"];

/// 允许的镜像方式。mpv 没有对应的属性，只能走 `vf` 滤镜链。
pub const VIDEO_FLIPS: &[&str] = &["h", "v", "both"];

/// 画质档位。
pub const VIDEO_PROFILES: &[&str] = &["high"];

/// 允许的 HDR 色调映射曲线，取自 mpv 的 `--tone-mapping`。
pub const TONE_MAPPINGS: &[&str] = &[
  "auto", "clip", "mobius", "reinhard", "hable", "gamma", "linear", "spline", "bt.2390",
  "bt.2446a", "st2094-40", "st2094-10",
];

/// 允许的快照格式。
pub const SCREENSHOT_FORMATS: &[&str] = &["jpg", "png", "webp"];

/// 允许的旋转角度。
pub const VIDEO_ROTATIONS: &[i64] = &[0, 90, 180, 270];

/// 色彩那五项：都要在 -100..100 之间，0 是中性。
pub const COLOR_CHANNELS: &[&str] = &["brightness", "contrast", "saturation", "hue", "gamma"];

/// 播放模式：顺序、单曲循环、列表循环、随机。见 [crate::settings::Settings::play_mode]。
pub const PLAY_MODES: &[&str] = &["sequence", "single", "list", "shuffle"];

/// 色彩与锐化的取值区间（跟 mpv 对齐）。
const COLOR_RANGE: (f64, f64) = (-100.0, 100.0);
const SHARPEN_RANGE: (f64, f64) = (0.0, 5.0);
const ZOOM_RANGE: (f64, f64) = (-20.0, 20.0);
const TARGET_PEAK_RANGE: (f64, f64) = (10.0, 10_000.0);
const HDR_RECOVERY_RANGE: (f64, f64) = (0.0, 2.0);

/// 默认硬解模式。和加设置之前写死在启动参数里的那个保持一致。
pub const DEFAULT_HWDEC: &str = "auto-safe";

/// `--sub-font-size` 的合法区间，跟 mpv 对齐。
const SUB_FONT_SIZE_RANGE: (f64, f64) = (1.0, 9000.0);

/// `--sub-pos` 的合法区间，跟 mpv 对齐：0 在顶部，100 是底部。
const SUB_POSITION_RANGE: (f64, f64) = (0.0, 150.0);

fn default_hwdec() -> String {
  DEFAULT_HWDEC.to_string()
}

/// 退出时默认记住播放位置。
fn default_save_position() -> bool {
  true
}

/// 默认走简单模式：刚上手的人不该先看到一排滑块。
fn default_filter_mode() -> String {
  "simple".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
  /// 硬解模式，对应 `--hwdec`。
  pub hwdec: String,
  /// 退出时把播放位置写进 watch-later，下次打开接着放。
  pub save_position: bool,
  /// 字幕自动加载模式；`None` 表示不传，交给 mpv 自己的默认值（`exact`）。
  pub sub_auto: Option<String>,
  /// 字幕字号，对应 `--sub-font-size`。
  pub sub_font_size: Option<f64>,
  /// 声道布局；`None` 表示不传，交给 mpv 自己的默认值（`auto-safe`）。
  pub audio_channels: Option<String>,
  /// 音频输出设备；`None` 表示不传，交给 mpv 自己的默认值（`auto`）。
  pub audio_device: Option<String>,
  /// 音频独占模式。开着会独占设备，别的程序就出不了声，所以默认关。
  pub audio_exclusive: bool,
  /// 字幕垂直位置；`None` 表示不传，交给 mpv 自己的默认值。
  pub sub_position: Option<f64>,
  /// ASS 字幕的样式覆盖模式；`None` 表示不传，交给 mpv 自己的默认值（`scale`）。
  pub sub_ass_override: Option<String>,
  /// 音频效果的呈现模式，见 [AUDIO_FILTER_MODES]。
  pub audio_filter_mode: String,
  /// 画面设置的呈现模式，取值同上。
  pub video_filter_mode: String,
  /// 响度归一化（动态）：把忽大忽小的对白拉平，晚上看视频时不用一直调音量。
  pub loudness_normalization: bool,
  /// 虚拟环绕：在立体声设备上模拟出包围感。
  pub virtual_surround: bool,
  /// 立体声扩展：拉开左右声道的差异。
  pub stereo_widening: bool,
  /// 均衡器预设，见 [crate::audio::PRESETS]。`custom` 表示用户手调过。
  pub equalizer_preset: Option<String>,
  /// 均衡器各段的增益（dB）。长度会被归一化成 [EQUALIZER_BANDS]。
  pub equalizer_bands: Option<Vec<f64>>,
  /// 输出采样率；`None` 表示跟随源。
  pub audio_samplerate: Option<u32>,
  /// 输出位深；`None` 表示跟随源。
  pub audio_format: Option<String>,
  /// 音频透传：把 AC3/DTS/TrueHD 原样交给功放。开着的时候滤镜链是空的。
  pub audio_spdif: bool,
  /// 画面比例档位，见 [ASPECT_MODES]。
  pub video_aspect: Option<String>,
  /// 填满窗口（裁掉黑边），对应 `panscan`。
  pub video_fill: bool,
  /// 缩放，对应 `video-zoom`（对数倍率，1 是两倍大）。
  pub video_zoom: Option<f64>,
  /// 旋转角度，对应 `video-rotate`。
  pub video_rotate: Option<i64>,
  /// 镜像，见 [VIDEO_FLIPS]。mpv 没有对应属性，走 `vf` 滤镜链。
  pub video_flip: Option<String>,
  /// 画质档位，见 [VIDEO_PROFILES]。
  pub video_profile: Option<String>,
  /// 色彩五项，取值 -100..100，0 是中性。
  pub video_brightness: Option<f64>,
  pub video_contrast: Option<f64>,
  pub video_saturation: Option<f64>,
  pub video_hue: Option<f64>,
  pub video_gamma: Option<f64>,
  /// 去色带。
  pub video_deband: bool,
  /// 补帧（把帧率提到显示器刷新率）。
  pub video_interpolation: bool,
  /// 跟随显示器的 ICC 色彩配置。
  pub video_icc: bool,
  /// 锐化强度。
  pub video_sharpen: Option<f64>,
  /// HDR 色调映射曲线，见 [TONE_MAPPINGS]。
  pub video_tone_mapping: Option<String>,
  /// 目标峰值亮度（nits）；`None` 表示交给 mpv 自动判断。
  pub video_target_peak: Option<f64>,
  /// HDR 对比度恢复强度。
  pub video_hdr_recovery: Option<f64>,
  /// 快照格式，见 [SCREENSHOT_FORMATS]。
  pub screenshot_format: Option<String>,
  /// 快照是否连字幕一起截。
  pub screenshot_subtitles: bool,
  /// 上次打开的目录。启动时直接铺回来，省得每次重新找。
  pub last_directory: Option<String>,
  /// 播放模式，见 [PLAY_MODES]。决定「播完一个之后放什么」。
  pub play_mode: String,
}

impl Default for Settings {
  fn default() -> Self {
    Self {
      hwdec: default_hwdec(),
      save_position: default_save_position(),
      sub_auto: None,
      sub_font_size: None,
      audio_channels: None,
      audio_device: None,
      audio_exclusive: false,
      sub_position: None,
      sub_ass_override: None,
      audio_filter_mode: default_filter_mode(),
      video_filter_mode: default_filter_mode(),
      loudness_normalization: false,
      virtual_surround: false,
      stereo_widening: false,
      equalizer_preset: None,
      equalizer_bands: None,
      audio_samplerate: None,
      audio_format: None,
      audio_spdif: false,
      video_aspect: None,
      video_fill: false,
      video_zoom: None,
      video_rotate: None,
      video_flip: None,
      video_profile: None,
      video_brightness: None,
      video_contrast: None,
      video_saturation: None,
      video_hue: None,
      video_gamma: None,
      video_deband: false,
      video_interpolation: false,
      video_icc: false,
      video_sharpen: None,
      video_tone_mapping: None,
      video_target_peak: None,
      video_hdr_recovery: None,
      screenshot_format: None,
      screenshot_subtitles: true,
      last_directory: None,
      play_mode: default_play_mode(),
    }
  }
}

impl Settings {
  /// 把不可能生效的取值折回默认。
  ///
  /// 面板还没做，这个文件是可以手改的。一个拼错的取值不该让播放直接起不来，
  /// 所以这里只做白名单和区间裁剪，不报错。
  pub fn normalized(mut self) -> Self {
    if !HWDEC_MODES.contains(&self.hwdec.as_str()) {
      self.hwdec = default_hwdec();
    }

    self.sub_auto = keep_choice(self.sub_auto, SUB_AUTO_MODES);
    self.audio_channels = keep_choice(self.audio_channels, AUDIO_CHANNELS);

    self.sub_font_size = self
      .sub_font_size
      .filter(|size| size.is_finite())
      .map(|size| size.clamp(SUB_FONT_SIZE_RANGE.0, SUB_FONT_SIZE_RANGE.1));

    self.sub_position = self
      .sub_position
      .filter(|position| position.is_finite())
      .map(|position| position.clamp(SUB_POSITION_RANGE.0, SUB_POSITION_RANGE.1));

    self.audio_device = self
      .audio_device
      .map(|name| name.trim().to_string())
      .filter(|name| !name.is_empty());

    self.sub_ass_override = keep_choice(self.sub_ass_override, SUB_ASS_OVERRIDE_MODES);

    if !FILTER_MODES.contains(&self.audio_filter_mode.as_str()) {
      self.audio_filter_mode = default_filter_mode();
    }

    if !FILTER_MODES.contains(&self.video_filter_mode.as_str()) {
      self.video_filter_mode = default_filter_mode();
    }

    self.audio_format = keep_choice(self.audio_format, AUDIO_FORMATS);
    self.equalizer_preset = keep_choice(self.equalizer_preset, crate::audio::PRESETS);

    // 0 就是 mpv 的「跟随源」，和 None 是同一件事，统一成 None 免得界面上多一个状态
    self.audio_samplerate = self
      .audio_samplerate
      .filter(|rate| *rate > 0 && *rate <= SAMPLERATE_LIMIT);

    // 频段数固定：少一段界面上就会缺一根滑块，多出来的直接丢掉
    self.equalizer_bands = self.equalizer_bands.map(|bands| {
      let mut normalized: Vec<f64> = bands
        .into_iter()
        .map(|gain| {
          if gain.is_finite() {
            gain.clamp(-EQUALIZER_GAIN_LIMIT, EQUALIZER_GAIN_LIMIT)
          } else {
            0.0
          }
        })
        .collect();

      normalized.resize(EQUALIZER_BANDS, 0.0);
      normalized
    });

    self.video_aspect = keep_choice(self.video_aspect, ASPECT_MODES);
    self.video_flip = keep_choice(self.video_flip, VIDEO_FLIPS);
    self.video_profile = keep_choice(self.video_profile, VIDEO_PROFILES);
    self.video_tone_mapping = keep_choice(self.video_tone_mapping, TONE_MAPPINGS);
    self.screenshot_format = keep_choice(self.screenshot_format, SCREENSHOT_FORMATS);

    // 旋转只认 0/90/180/270：别的角度 mpv 也收，但界面上只有一个档位选择
    self.video_rotate = self.video_rotate.filter(|degrees| VIDEO_ROTATIONS.contains(degrees));

    self.video_zoom = clamp_option(self.video_zoom, ZOOM_RANGE);
    self.video_sharpen = clamp_option(self.video_sharpen, SHARPEN_RANGE);
    self.video_target_peak = clamp_option(self.video_target_peak, TARGET_PEAK_RANGE);
    self.video_hdr_recovery = clamp_option(self.video_hdr_recovery, HDR_RECOVERY_RANGE);

    self.video_brightness = clamp_option(self.video_brightness, COLOR_RANGE);
    self.video_contrast = clamp_option(self.video_contrast, COLOR_RANGE);
    self.video_saturation = clamp_option(self.video_saturation, COLOR_RANGE);
    self.video_hue = clamp_option(self.video_hue, COLOR_RANGE);
    self.video_gamma = clamp_option(self.video_gamma, COLOR_RANGE);

    self.last_directory = self
      .last_directory
      .map(|path| path.trim().to_string())
      .filter(|path| !path.is_empty());

    if !PLAY_MODES.contains(&self.play_mode.as_str()) {
      self.play_mode = default_play_mode();
    }

    self
  }
}

/// 默认顺序播放：播完列表里的下一个，到末尾就停。
fn default_play_mode() -> String {
  "sequence".to_string()
}

/// 把可选的数值夹进区间；NaN 这种坏值直接当没设置过。
fn clamp_option(value: Option<f64>, range: (f64, f64)) -> Option<f64> {
  value
    .filter(|number| number.is_finite())
    .map(|number| number.clamp(range.0, range.1))
}

/// 空串和不在白名单里的取值一律当成「没设置过」。
fn keep_choice(value: Option<String>, allowed: &[&str]) -> Option<String> {
  value
    .map(|choice| choice.trim().to_string())
    .filter(|choice| allowed.contains(&choice.as_str()))
}

/// 应用配置目录。设置文件和 watch-later 都放这儿。
pub fn config_dir(app: &tauri::AppHandle) -> PathBuf {
  app
    .path()
    .app_config_dir()
    .unwrap_or_else(|_| std::env::temp_dir().join("fuvideo"))
}

/// 读设置。
///
/// 文件不存在、读不动、内容是坏 JSON、字段类型对不上——一律退回默认值，
/// 不让一个坏文件把播放器挡在门外。
pub fn load(directory: &Path) -> Settings {
  match fs::read_to_string(directory.join(SETTINGS_FILE)) {
    Ok(text) => serde_json::from_str::<Settings>(&text).unwrap_or_default().normalized(),
    Err(_) => Settings::default(),
  }
}

/// 写设置，返回归一化之后真正落盘的那份。
///
/// 返回归一化结果是为了让界面显示的和存进去的一致：用户填了越界的值，
/// 界面上应该立刻看到被折回的实际值，而不是等他重启才发现对不上。
pub fn save(directory: &Path, settings: Settings) -> Result<Settings, String> {
  let normalized = settings.normalized();

  fs::create_dir_all(directory).map_err(|error| format!("创建设置目录失败: {error}"))?;

  let text = serde_json::to_string_pretty(&normalized)
    .map_err(|error| format!("序列化设置失败: {error}"))?;

  fs::write(directory.join(SETTINGS_FILE), text).map_err(|error| format!("写入设置失败: {error}"))?;

  Ok(normalized)
}

/// 读取全局设置。桌面端只要设置面板打开就会调它。
#[tauri::command]
pub fn read_settings(app: tauri::AppHandle) -> Settings {
  load(&config_dir(&app))
}

/// 写入全局设置，返回实际生效的取值。
#[tauri::command]
pub fn write_settings(app: tauri::AppHandle, settings: Settings) -> Result<Settings, String> {
  save(&config_dir(&app), settings)
}

/// 记下这次打开的目录，下次启动直接铺回来。
///
/// 单独开一条命令而不是让界面把整份设置写回来：界面手里那份可能是几分钟前读的，
/// 拿它整体覆盖会把期间改过的音频/画面设置一起冲掉。
#[tauri::command]
pub fn remember_directory(app: tauri::AppHandle, path: String) -> Result<Settings, String> {
  let directory = config_dir(&app);
  let mut current = load(&directory);

  current.last_directory = Some(path);

  save(&directory, current)
}

#[cfg(test)]
mod tests {
  use super::*;

  /// 每个用例用各自的临时目录，避免并行跑测试时互相踩。
  fn temp_dir(label: &str) -> PathBuf {
    let directory = std::env::temp_dir().join(format!("fuvideo-settings-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    directory
  }

  #[test]
  fn defaults_match_the_behaviour_before_settings_existed() {
    let settings = Settings::default();

    // 硬解和「退出时记住位置」是有默认值的，其余都靠「不传」保持 mpv 自己的默认
    assert_eq!(settings.hwdec, "auto-safe");
    assert!(settings.save_position);
    assert_eq!(settings.sub_auto, None);
    assert_eq!(settings.sub_font_size, None);
    assert_eq!(settings.audio_channels, None);
    assert_eq!(settings.audio_device, None);
    assert!(!settings.audio_exclusive, "独占模式默认关：开着会抢占设备");
    assert_eq!(settings.sub_position, None);
    assert_eq!(settings.audio_filter_mode, "simple", "默认走简单模式");
    assert!(!settings.loudness_normalization);
    assert!(!settings.virtual_surround);
    assert!(!settings.stereo_widening);
    assert_eq!(settings.equalizer_preset, None);
    assert_eq!(settings.equalizer_bands, None);
    assert_eq!(settings.audio_samplerate, None);
    assert_eq!(settings.audio_format, None);
    assert!(!settings.audio_spdif, "透传默认关：它会让音频绕过所有滤镜");
  }

  #[test]
  fn missing_file_falls_back_to_defaults() {
    let directory = temp_dir("missing");

    assert_eq!(load(&directory), Settings::default());
  }

  #[test]
  fn broken_json_falls_back_to_defaults() {
    let directory = temp_dir("broken");
    fs::create_dir_all(&directory).expect("建目录");
    fs::write(directory.join(SETTINGS_FILE), b"{ this is not json").expect("写入坏文件");

    assert_eq!(load(&directory), Settings::default());
  }

  #[test]
  fn saved_settings_survive_a_round_trip() {
    let directory = temp_dir("round-trip");
    let settings = Settings {
      hwdec: "d3d11va".to_string(),
      save_position: false,
      sub_auto: Some("fuzzy".to_string()),
      sub_font_size: Some(48.0),
      audio_channels: Some("stereo".to_string()),
      audio_device: Some("wasapi/{device}".to_string()),
      audio_exclusive: true,
      sub_position: Some(92.0),
      sub_ass_override: Some("force".to_string()),
      audio_filter_mode: "advanced".to_string(),
      video_filter_mode: "simple".to_string(),
      loudness_normalization: true,
      virtual_surround: true,
      stereo_widening: false,
      equalizer_preset: Some("music".to_string()),
      equalizer_bands: Some(vec![3.0, 2.5, 1.5, 0.5, -0.5, -1.0, 0.0, 1.5, 2.5, 3.0]),
      audio_samplerate: Some(48000),
      audio_format: Some("float".to_string()),
      audio_spdif: false,
      video_aspect: Some("16:9".to_string()),
      video_fill: true,
      video_zoom: Some(0.5),
      video_rotate: Some(90),
      video_flip: Some("h".to_string()),
      video_profile: Some("high".to_string()),
      video_brightness: Some(10.0),
      video_contrast: Some(-5.0),
      video_saturation: Some(20.0),
      video_hue: Some(0.0),
      video_gamma: Some(0.0),
      video_deband: true,
      video_interpolation: false,
      video_icc: false,
      video_sharpen: Some(1.0),
      video_tone_mapping: Some("bt.2390".to_string()),
      video_target_peak: Some(180.0),
      video_hdr_recovery: Some(0.5),
      screenshot_format: Some("png".to_string()),
      screenshot_subtitles: false,
      last_directory: Some(r"E:\clips\anime".to_string()),
      play_mode: "shuffle".to_string(),
    };

    let written = save(&directory, settings.clone()).expect("写入设置");

    assert_eq!(written, settings);
    assert_eq!(load(&directory), settings);

    let _ = fs::remove_dir_all(&directory);
  }

  /// 只写了一半的旧文件（比如以后加了新字段）也要能用。
  #[test]
  fn partial_file_keeps_defaults_for_missing_fields() {
    let directory = temp_dir("partial");
    fs::create_dir_all(&directory).expect("建目录");
    fs::write(directory.join(SETTINGS_FILE), br#"{ "hwdec": "nvdec" }"#).expect("写入半个文件");

    let loaded = load(&directory);

    assert_eq!(loaded.hwdec, "nvdec");
    assert!(loaded.save_position, "缺的字段应该落到默认值");
    assert_eq!(loaded.sub_auto, None);

    let _ = fs::remove_dir_all(&directory);
  }

  #[test]
  fn unknown_hwdec_falls_back_to_default() {
    let settings = Settings {
      hwdec: "magic-gpu".to_string(),
      ..Settings::default()
    };

    assert_eq!(settings.normalized().hwdec, "auto-safe");
  }

  #[test]
  fn unknown_choices_are_dropped_instead_of_passed_through() {
    let settings = Settings {
      sub_auto: Some("sometimes".to_string()),
      audio_channels: Some("9.1".to_string()),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.sub_auto, None);
    assert_eq!(settings.audio_channels, None);
  }

  #[test]
  fn blank_audio_device_is_treated_as_unset() {
    let settings = Settings {
      audio_device: Some("   ".to_string()),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.audio_device, None);
  }

  #[test]
  fn subtitle_size_is_clamped_and_nan_is_dropped() {
    let too_big = Settings {
      sub_font_size: Some(99999.0),
      ..Settings::default()
    }
    .normalized();
    let not_a_number = Settings {
      sub_font_size: Some(f64::NAN),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(too_big.sub_font_size, Some(SUB_FONT_SIZE_RANGE.1));
    assert_eq!(not_a_number.sub_font_size, None);
  }

  #[test]
  fn subtitle_position_is_clamped_to_the_mpv_range() {
    let below = Settings {
      sub_position: Some(-20.0),
      ..Settings::default()
    }
    .normalized();
    let above = Settings {
      sub_position: Some(999.0),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(below.sub_position, Some(SUB_POSITION_RANGE.0));
    assert_eq!(above.sub_position, Some(SUB_POSITION_RANGE.1));
  }

  /// 前端按 camelCase 读字段，名字一旦对不上，界面会静默拿到 undefined。
  #[test]
  fn settings_serialize_camel_case_fields() {
    let value = serde_json::to_value(Settings::default()).expect("序列化设置");

    for key in [
      "hwdec",
      "savePosition",
      "subAuto",
      "subFontSize",
      "audioChannels",
      "audioDevice",
      "audioExclusive",
      "subPosition",
      "subAssOverride",
      "audioFilterMode",
      "loudnessNormalization",
      "virtualSurround",
      "stereoWidening",
      "equalizerPreset",
      "equalizerBands",
      "audioSamplerate",
      "audioFormat",
      "audioSpdif",
      "videoAspect",
      "videoFill",
      "videoZoom",
      "videoRotate",
      "videoFlip",
      "videoProfile",
      "videoBrightness",
      "videoDeband",
      "videoToneMapping",
      "videoTargetPeak",
      "screenshotFormat",
      "screenshotSubtitles",
      "lastDirectory",
      "playMode",
    ] {
      assert!(value.get(key).is_some(), "设置里缺少字段 {key}");
    }
  }

  #[test]
  fn equalizer_bands_are_clamped_and_resized_to_the_fixed_width() {
    let short = Settings {
      equalizer_bands: Some(vec![99.0, -99.0]),
      ..Settings::default()
    }
    .normalized();
    let long = Settings {
      equalizer_bands: Some(vec![0.0; 20]),
      ..Settings::default()
    }
    .normalized();

    let bands = short.equalizer_bands.expect("补齐之后的频段");
    assert_eq!(bands.len(), EQUALIZER_BANDS);
    assert_eq!(bands[0], EQUALIZER_GAIN_LIMIT);
    assert_eq!(bands[1], -EQUALIZER_GAIN_LIMIT);
    assert_eq!(bands[2], 0.0, "缺的段补 0");
    assert_eq!(long.equalizer_bands.expect("截断之后的频段").len(), EQUALIZER_BANDS);
  }

  /// 0 和「跟随源」是同一件事，别在界面上留两个看起来不一样的等价状态。
  #[test]
  fn samplerate_zero_means_follow_the_source() {
    let settings = Settings {
      audio_samplerate: Some(0),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.audio_samplerate, None);
  }

  #[test]
  fn unknown_audio_format_or_mode_or_preset_falls_back() {
    let settings = Settings {
      audio_format: Some("s24".to_string()),
      audio_filter_mode: "expert".to_string(),
      equalizer_preset: Some("cinema".to_string()),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.audio_format, None);
    assert_eq!(settings.audio_filter_mode, "simple");
    assert_eq!(settings.equalizer_preset, None);
  }
}
  /// 空白路径当成没记过：界面传空串时不该把上次的目录覆盖掉。
  #[test]
  fn blank_last_directory_is_treated_as_unset() {
    let settings = Settings {
      last_directory: Some("   ".to_string()),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.last_directory, None);
  }

  /// 只有文件名（没带目录）也要原样留着：那是后端自己的事，设置层不做判断。
  #[test]
  fn last_directory_keeps_its_value() {
    let settings = Settings {
      last_directory: Some(r"E:\clips\anime".to_string()),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.last_directory.as_deref(), Some(r"E:\clips\anime"));
  }

  #[test]
  fn unknown_play_mode_falls_back_to_sequence() {
    let settings = Settings {
      play_mode: "random".to_string(),
      ..Settings::default()
    }
    .normalized();

    assert_eq!(settings.play_mode, "sequence");
    assert_eq!(Settings::default().play_mode, "sequence", "默认是顺序播放");
  }

