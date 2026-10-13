//! 画面的设置模型。
//!
//! 和音频那一节（[crate::audio]）最大的区别是：**这里几乎没有滤镜链**。
//! 缩放、画幅、旋转、色彩五项、去色带、锐化、补帧、ICC、HDR 在 mpv 里都是可以直接
//! 实时写的属性（查过 `--list-options`：`brightness` 之类都是 -100..100 的 Float，
//! `video-zoom` 是 -20..20 的 Float），不需要像均衡器那样重建滤镜链。
//!
//! 唯一要走 `vf` 的是**镜像翻转**——mpv 有 `video-rotate`，但没有对应的镜像属性。
//! 滤镜链仍然只留一个出口（[build_filter_chain]），理由和音频那边一样：
//! 谁想加一条都自己发一次 `vf`，两个功能一叠加就会互相覆盖。

use serde::Serialize;

use crate::audio::OptionChoice;
use crate::settings::{Settings, VIDEO_ROTATIONS};

/// 画面比例档位对应的数值。
///
/// mpv 的 `--video-aspect-override` 用负数表示特殊含义：`-2` 是「自动」（默认），
/// `-1` 是「跟着窗口走」——也就是把画面拉伸填满窗口。
pub fn aspect_value(mode: &str) -> Option<f64> {
  Some(match mode {
    "auto" => -2.0,
    "window" => -1.0,
    "16:9" => 16.0 / 9.0,
    "4:3" => 4.0 / 3.0,
    "21:9" => 21.0 / 9.0,
    "1:1" => 1.0,
    _ => return None,
  })
}

/// 把设置拼成画面滤镜链（目前只有镜像，没开就是空链）。
pub fn build_filter_chain(settings: &Settings) -> Vec<String> {
  let Some(flip) = &settings.video_flip else {
    return Vec::new();
  };

  let mut chain = Vec::new();

  if flip == "h" || flip == "both" {
    chain.push("hflip".to_string());
  }

  if flip == "v" || flip == "both" {
    chain.push("vflip".to_string());
  }

  chain
}

/// 只有画质档位和高解这两个要写进启动参数。
///
/// 其余画面项都是运行时可写的属性（换片之后统一压一遍，见 `apply_video_settings`），
/// 没必要塞进命令行；而硬解必须在视频输出初始化之前定下来，画质档位会一次性改一批
/// 缩放相关的选项，也放在启动参数里更干净。
pub fn build_player_args(settings: &Settings) -> Vec<String> {
  let mut args = Vec::new();

  if settings.video_profile.as_deref() == Some("high") {
    args.push("--profile=gpu-hq".to_string());
  }

  args
}

/* ---------------- 给界面用的选项表 ---------------- */

fn choice(id: &str, label: &str) -> OptionChoice {
  OptionChoice {
    id: id.to_string(),
    label: label.to_string(),
  }
}

/// 设置页「画面」那一节要用的选项表。标签放在这边，界面不抄一份。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOptions {
  /// 色彩五项的取值范围，界面拿它当滑块的上下限。
  pub color_limit: i32,
  pub sharpen_limit: i32,
  pub aspects: Vec<OptionChoice>,
  pub rotations: Vec<i64>,
  pub flips: Vec<OptionChoice>,
  pub profiles: Vec<OptionChoice>,
  pub tone_mappings: Vec<OptionChoice>,
  pub hwdec: Vec<OptionChoice>,
  pub screenshot_formats: Vec<OptionChoice>,
}

impl Default for VideoOptions {
  fn default() -> Self {
    Self {
      color_limit: 100,
      sharpen_limit: 5,
      aspects: vec![
        choice("auto", "自动"),
        choice("window", "拉伸填满窗口"),
        choice("16:9", "16:9"),
        choice("4:3", "4:3"),
        choice("21:9", "21:9"),
        choice("1:1", "1:1"),
      ],
      rotations: VIDEO_ROTATIONS.to_vec(),
      flips: vec![
        choice("h", "左右镜像"),
        choice("v", "上下镜像"),
        choice("both", "同时镜像"),
      ],
      profiles: vec![choice("high", "高质量（缩放更锐利）")],
      tone_mappings: vec![
        choice("auto", "自动"),
        choice("bt.2390", "BT.2390（推荐）"),
        choice("hable", "Hable"),
        choice("mobius", "Mobius"),
        choice("reinhard", "Reinhard"),
        choice("spline", "Spline"),
        choice("st2094-40", "ST2094-40"),
        choice("st2094-10", "ST2094-10"),
        choice("bt.2446a", "BT.2446A"),
        choice("gamma", "Gamma"),
        choice("linear", "Linear"),
        choice("clip", "直接截断"),
      ],
      hwdec: vec![
        choice("auto-safe", "自动（推荐）"),
        choice("d3d11va", "D3D11（通用）"),
        choice("nvdec", "NVDEC（NVIDIA）"),
        choice("amf", "AMF（AMD）"),
        choice("no", "关闭，用软件解码"),
      ],
      screenshot_formats: vec![
        choice("jpg", "JPEG（体积小）"),
        choice("png", "PNG（无损）"),
        choice("webp", "WebP"),
      ],
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::settings::{
    ASPECT_MODES, HWDEC_MODES, SCREENSHOT_FORMATS, TONE_MAPPINGS, VIDEO_FLIPS, VIDEO_PROFILES,
  };

  fn settings_with(change: impl FnOnce(&mut Settings)) -> Settings {
    let mut settings = Settings::default();
    change(&mut settings);
    settings.normalized()
  }

  #[test]
  fn aspect_modes_all_map_to_a_number() {
    for mode in ASPECT_MODES {
      let value = aspect_value(mode).unwrap_or_else(|| panic!("{mode} 没有对应的比例"));

      // -2 是自动、-1 是跟窗口走，其余是正的宽高比
      assert!(value == -2.0 || value == -1.0 || value > 0.0, "{mode} 的取值不合理: {value}");
    }

    assert_eq!(aspect_value("auto"), Some(-2.0));
    assert_eq!(aspect_value("window"), Some(-1.0));
    assert_eq!(aspect_value("nope"), None);
  }

  /// 界面上给的每一档都要能被 mpv 认下来（否则存进去会被折回默认，表现为「点了没反应」）。
  #[test]
  fn option_ids_survive_normalization() {
    let options = VideoOptions::default();

    for option in &options.aspects {
      let settings = settings_with(|settings| settings.video_aspect = Some(option.id.clone()));
      assert_eq!(settings.video_aspect.as_deref(), Some(option.id.as_str()), "{} 被折回默认了", option.id);
    }

    for option in &options.flips {
      let settings = settings_with(|settings| settings.video_flip = Some(option.id.clone()));
      assert_eq!(settings.video_flip.as_deref(), Some(option.id.as_str()));
    }

    for option in &options.tone_mappings {
      let settings =
        settings_with(|settings| settings.video_tone_mapping = Some(option.id.clone()));
      assert_eq!(settings.video_tone_mapping.as_deref(), Some(option.id.as_str()));
    }

    for option in &options.screenshot_formats {
      let settings =
        settings_with(|settings| settings.screenshot_format = Some(option.id.clone()));
      assert_eq!(settings.screenshot_format.as_deref(), Some(option.id.as_str()));
    }

    for option in &options.hwdec {
      assert!(
        HWDEC_MODES.contains(&option.id.as_str()),
        "界面上给了硬解 {}，但设置的白名单里没有",
        option.id
      );
    }

    for degrees in &options.rotations {
      let settings = settings_with(|settings| settings.video_rotate = Some(*degrees));
      assert_eq!(settings.video_rotate, Some(*degrees));
    }
  }

  #[test]
  fn options_cover_every_whitelisted_choice() {
    let options = VideoOptions::default();

    assert_eq!(options.aspects.len(), ASPECT_MODES.len());
    assert_eq!(options.flips.len(), VIDEO_FLIPS.len());
    assert_eq!(options.profiles.len(), VIDEO_PROFILES.len());
    assert_eq!(options.screenshot_formats.len(), SCREENSHOT_FORMATS.len());

    for mode in TONE_MAPPINGS {
      assert!(
        options.tone_mappings.iter().any(|option| option.id == *mode),
        "白名单里的 {mode} 在界面上没有对应项"
      );
    }
  }

  #[test]
  fn flips_become_filters_in_one_place() {
    assert!(build_filter_chain(&Settings::default()).is_empty());

    let horizontal = settings_with(|settings| settings.video_flip = Some("h".to_string()));
    let vertical = settings_with(|settings| settings.video_flip = Some("v".to_string()));
    let both = settings_with(|settings| settings.video_flip = Some("both".to_string()));

    assert_eq!(build_filter_chain(&horizontal), vec!["hflip"]);
    assert_eq!(build_filter_chain(&vertical), vec!["vflip"]);
    assert_eq!(build_filter_chain(&both), vec!["hflip", "vflip"]);
  }

  #[test]
  fn only_the_high_profile_reaches_the_command_line() {
    assert!(build_player_args(&Settings::default()).is_empty());

    let high = settings_with(|settings| settings.video_profile = Some("high".to_string()));

    assert_eq!(build_player_args(&high), vec!["--profile=gpu-hq"]);
  }

  #[test]
  fn unknown_values_are_dropped_instead_of_passed_through() {
    let settings = settings_with(|settings| {
      settings.video_rotate = Some(45);
      settings.video_aspect = Some("3:2".to_string());
      settings.video_sharpen = Some(99.0);
      settings.video_brightness = Some(-500.0);
      settings.video_tone_mapping = Some("cinema".to_string());
    });

    assert_eq!(settings.video_rotate, None, "45 度不在档位里");
    assert_eq!(settings.video_aspect, None);
    assert_eq!(settings.video_sharpen, Some(5.0), "锐化要夹到上限");
    assert_eq!(settings.video_brightness, Some(-100.0), "色彩要夹到区间里");
    assert_eq!(settings.video_tone_mapping, None);
  }
}
