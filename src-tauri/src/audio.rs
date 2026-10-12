//! 音频效果的设置模型与滤镜链拼接。
//!
//! **均衡器为什么不用 `superequalizer`**：它虽然号称 18 段，但各个频段的中心频率
//! 没有公开，滑块根本标不出「这一段调的是多少 Hz」，用户只能盲调，预设也无从谈起。
//! 改成串联 ffmpeg 的 `equalizer`（峰值滤波器）之后频点由我们自己定，于是有了常见的
//! 10 段图形均衡器，每段能标频点、预设才有意义。
//!
//! **滤镜链只能有一个出口**（`build_filter_chain`）：mpv 的 `af` 是整体替换的语义，
//! 谁想加一条滤镜都自己发一次 `af`，两个功能一叠加就会互相覆盖。
//!
//! 另外实测过一件事：`af-command` 对 `lavfi=[...]` 桥接过来的滤镜**不支持**
//! （裸参数回 `invalid parameter`，带 `av-command` 回 `error running command`），
//! 所以调参只能重建整条链。界面上因此必须节流：拖动过程只改界面，松手才提交。

use serde::Serialize;

use crate::settings::{Settings, EQUALIZER_BANDS};

/// 10 段图形均衡器的频点（Hz），从低到高。
pub const EQUALIZER_FREQUENCIES: [u32; EQUALIZER_BANDS] =
  [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/// 单个频段的增益上限（dB）。再往上就容易削顶，听起来是更大的失真而不是更大的声。
pub const GAIN_LIMIT: f64 = 12.0;

/// 小于这个值的增益当成 0：均衡器是串联的，系数为 0 的那段去掉能省一次运算，
/// 回读的滤镜链也更干净。
const GAIN_EPSILON: f64 = 0.05;

/// 透传时原样交给功放的编码。开了它音频就不走滤镜链了。
pub const SPDIF_CODECS: &str = "ac3,dts,eac3,truehd,dts-hd";

/// 均衡器预设。`custom` 只作为存储值出现：用户手调某一频段之后就落到它。
pub const PRESETS: &[&str] =
  &["off", "flat", "music", "movie", "night", "voice", "bass", "custom"];

/// 预设的每段增益（dB），顺序和 `EQUALIZER_FREQUENCIES` 一致。
///
/// 这些曲线是照常见播放器的口味定的，不是声学测量结果。原则是：低频抬一点会有
/// 「厚」的感觉，中频（人声在 1k-4k）尽量不动，高频稍抬会觉得「通透」。
pub fn preset_gains(preset: &str) -> Option<[f64; EQUALIZER_BANDS]> {
  Some(match preset {
    // 关闭和「平坦」都是全 0，区别只在界面上怎么显示
    "off" | "flat" => [0.0; EQUALIZER_BANDS],
    // 音乐：两头微抬，中间略收
    "music" => [3.0, 2.5, 1.5, 0.5, -0.5, -1.0, 0.0, 1.5, 2.5, 3.0],
    // 电影：补低频氛围，同时把对白所在的频段顶起来
    "movie" => [4.0, 3.0, 1.0, 0.0, 1.0, 2.5, 3.0, 1.5, 0.5, 1.0],
    // 夜间：砍掉轰头的低频、突出对白，音量可以开小一点不吵到人
    "night" => [-5.0, -4.0, -2.0, 0.0, 2.0, 3.5, 3.0, 0.5, -1.0, -2.5],
    // 人声：低切 + 中频突出，听播客和网课用
    "voice" => [-7.0, -5.0, -3.0, 0.0, 3.0, 4.5, 3.5, 1.0, -1.5, -3.5],
    // 低音增强：只动低频，别的不碰
    "bass" => [8.0, 6.5, 4.5, 2.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    _ => return None,
  })
}

/// 把设置拼成一条 mpv 的 `af` 滤镜链（空数组表示不带任何滤镜）。
///
/// 顺序是有理由的：先用均衡器定音色，再做响度归一化（这样归一化处理的是已经调过音的
/// 信号），最后才是空间类效果（立体声扩展、环绕）——它们改变的是声场，放在最后就不会
/// 被前面的增益影响。
///
/// 透传开着时整条链是空的：mpv 的透传不经过滤镜，挂了也没用。与其让用户以为「开了没反应」，
/// 不如让链上真的什么都没有——界面那边也要说清楚。
pub fn build_filter_chain(settings: &Settings) -> Vec<String> {
  if settings.audio_spdif {
    return Vec::new();
  }

  let mut chain = Vec::new();

  if let Some(bands) = &settings.equalizer_bands {
    for (index, gain) in bands.iter().enumerate().take(EQUALIZER_BANDS) {
      if gain.abs() < GAIN_EPSILON {
        continue;
      }

      let frequency = EQUALIZER_FREQUENCIES[index];

      chain.push(format!(
        "@eq{index:02}:lavfi=[equalizer=f={frequency}:width_type=o:width=1:g={gain}]"
      ));
    }
  }

  if settings.loudness_normalization {
    chain.push("@norm:lavfi=[dynaudnorm]".to_string());
  }

  if settings.stereo_widening {
    // 默认的 2.5 太夸张，1.6 是「能听出来但不假」的程度
    chain.push("@wide:lavfi=[extrastereo=m=1.6]".to_string());
  }

  if settings.virtual_surround {
    chain.push("@surround:lavfi=[surround]".to_string());
  }

  chain
}

/* ---------------- 给界面用的选项表 ---------------- */

/// 一个可选项：给机器看的 id 和给人看的名字。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionChoice {
  pub id: String,
  pub label: String,
}

fn choice(id: &str, label: &str) -> OptionChoice {
  OptionChoice {
    id: id.to_string(),
    label: label.to_string(),
  }
}

/// 设置页要用到的选项表。
///
/// 标签放在这边而不是前端，是为了让「id 和它的名字」只有一个来源：频点和预设本来就是
/// 滤镜链的一部分，散到两个语言里迟早会对不上。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOptions {
  /// 均衡器各段的频点（Hz），从低到高。
  pub frequencies: Vec<u32>,
  /// 单段增益的上限（dB）。
  pub gain_limit: i32,
  pub modes: Vec<OptionChoice>,
  pub presets: Vec<OptionChoice>,
  pub samplerates: Vec<OptionChoice>,
  pub formats: Vec<OptionChoice>,
}

impl Default for AudioOptions {
  fn default() -> Self {
    Self {
      frequencies: EQUALIZER_FREQUENCIES.to_vec(),
      gain_limit: GAIN_LIMIT as i32,
      modes: vec![choice("simple", "简单"), choice("advanced", "高级")],
      presets: vec![
        choice("off", "关闭"),
        choice("flat", "平坦"),
        choice("music", "音乐"),
        choice("movie", "电影"),
        choice("night", "夜间"),
        choice("voice", "人声"),
        choice("bass", "低音增强"),
      ],
      samplerates: vec![
        choice("source", "跟随源"),
        choice("44100", "44100 Hz"),
        choice("48000", "48000 Hz"),
        choice("96000", "96000 Hz"),
      ],
      formats: vec![
        choice("source", "跟随源"),
        choice("s16", "16 位整数"),
        choice("s32", "32 位整数"),
        choice("float", "32 位浮点"),
      ],
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn settings_with(effects: impl FnOnce(&mut Settings)) -> Settings {
    let mut settings = Settings::default();
    effects(&mut settings);
    settings.normalized()
  }

  fn ridge() -> Vec<f64> {
    let mut bands = vec![0.0; EQUALIZER_BANDS];
    bands[0] = 6.0;
    bands
  }

  /// `custom` 只是「用户手调过」的存储标记，本身没有固定曲线，所以跳过它。
  #[test]
  fn every_offered_preset_covers_all_bands_within_range() {
    for preset in PRESETS.iter().copied().filter(|preset| *preset != "custom") {
      let gains = preset_gains(preset).unwrap_or_else(|| panic!("预设 {preset} 没有对应的曲线"));

      assert_eq!(gains.len(), EQUALIZER_BANDS);

      for gain in gains {
        assert!(
          gain.abs() <= GAIN_LIMIT,
          "预设 {preset} 有一段的增益超出 ±{GAIN_LIMIT}: {gain}"
        );
      }
    }

    assert_eq!(preset_gains("custom"), None, "自定义是用户改出来的，没有固定曲线");
  }

  #[test]
  fn unknown_preset_has_no_curve() {
    assert_eq!(preset_gains("cinema"), None);
  }

  #[test]
  fn flat_and_off_are_silent_curves() {
    assert_eq!(preset_gains("off"), Some([0.0; EQUALIZER_BANDS]));
    assert_eq!(preset_gains("flat"), Some([0.0; EQUALIZER_BANDS]));
  }

  /// 低音增强只该动低频：动了中频就变成「闷」而不是「厚」。
  #[test]
  fn bass_preset_only_touches_the_low_bands() {
    let gains = preset_gains("bass").expect("低音增强曲线");

    assert!(gains[0] > 0.0 && gains[3] > 0.0);
    assert!(gains[4..].iter().all(|gain| *gain == 0.0));
  }

  #[test]
  fn default_settings_produce_an_empty_chain() {
    assert!(build_filter_chain(&Settings::default()).is_empty());
  }

  /// 零增益的频段要被跳过：串联的滤波器越少越省，回读的链也越干净。
  #[test]
  fn flat_curve_contributes_no_filters() {
    let settings = settings_with(|settings| {
      settings.equalizer_preset = Some("flat".to_string());
      settings.equalizer_bands = Some(vec![0.0; EQUALIZER_BANDS]);
    });

    assert!(build_filter_chain(&settings).is_empty());
  }

  #[test]
  fn equalizer_bands_carry_their_frequency() {
    let settings = settings_with(|settings| {
      let mut bands = vec![0.0; EQUALIZER_BANDS];
      bands[0] = 6.0;
      bands[2] = -4.0;
      settings.equalizer_bands = Some(bands);
    });

    let chain = build_filter_chain(&settings);

    assert_eq!(chain.len(), 2, "只有两段有增益: {chain:?}");
    assert!(chain[0].starts_with("@eq00:lavfi=[equalizer=f=31:"));
    assert!(chain[0].contains("g=6"));
    assert!(chain[1].starts_with("@eq02:lavfi=[equalizer=f=125:"));
    assert!(chain[1].contains("g=-4"));
  }

  /// 顺序：均衡 → 响度归一化 → 立体声扩展 → 环绕。
  #[test]
  fn chain_order_puts_tone_shaping_first_and_space_last() {
    let settings = settings_with(|settings| {
      settings.equalizer_bands = Some(ridge());
      settings.loudness_normalization = true;
      settings.stereo_widening = true;
      settings.virtual_surround = true;
    });

    let chain = build_filter_chain(&settings);
    let labels: Vec<&str> = chain
      .iter()
      .map(|filter| &filter[..filter.find(':').expect("每条滤镜都带标签")])
      .collect();

    assert_eq!(labels, vec!["@eq00", "@norm", "@wide", "@surround"]);
  }

  /// 透传开着的时候滤镜是无效的，那就别挂——挂了只会让人以为开关坏了。
  #[test]
  fn passthrough_drops_the_whole_chain() {
    let settings = settings_with(|settings| {
      settings.audio_spdif = true;
      settings.loudness_normalization = true;
      settings.virtual_surround = true;
      settings.equalizer_bands = Some(ridge());
    });

    assert!(build_filter_chain(&settings).is_empty());
  }

  #[test]
  fn options_cover_every_preset_that_has_a_curve() {
    let options = AudioOptions::default();

    assert_eq!(options.frequencies, EQUALIZER_FREQUENCIES);

    for option in &options.presets {
      assert!(
        preset_gains(&option.id).is_some(),
        "界面上给了预设 {}，但没有对应的曲线",
        option.id
      );
    }
  }

  /// 界面上的选项 id 必须都能活过设置的白名单，否则存进去会被折回默认，
  /// 表现就是「点了没反应」。
  #[test]
  fn option_ids_survive_normalization() {
    let options = AudioOptions::default();

    for option in &options.formats {
      if option.id == "source" {
        continue;
      }

      let settings = settings_with(|settings| settings.audio_format = Some(option.id.clone()));

      assert_eq!(
        settings.audio_format.as_deref(),
        Some(option.id.as_str()),
        "位深 {} 被折回默认了",
        option.id
      );
    }

    for option in &options.samplerates {
      let value = option.id.parse::<u32>().ok();
      let settings = settings_with(|settings| settings.audio_samplerate = value);

      assert_eq!(settings.audio_samplerate, value);
    }
  }
}
