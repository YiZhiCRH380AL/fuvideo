//! 播放器音频频谱。
//!
//! 音频由 mpv 子进程输出，前端 Web Audio 拿不到这段声音。这里用 WASAPI
//! 进程树回环只捕获 fuvideo + mpv，再用现有 10 段均衡器频点做 Goertzel 分析。

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use wasapi::{
  AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
  initialize_mta,
};

use crate::audio::EQUALIZER_FREQUENCIES;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;
const WINDOW_FRAMES: usize = 4096;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSpectrum {
  pub frequencies: Vec<u32>,
  pub levels: Vec<f32>,
}

struct Shared {
  started: bool,
  levels: [f32; EQUALIZER_FREQUENCIES.len()],
  error: Option<String>,
}

#[derive(Clone, Default)]
pub struct SpectrumState {
  shared: Arc<Mutex<Shared>>,
}

impl Default for Shared {
  fn default() -> Self {
    Self {
      started: false,
      levels: [0.0; EQUALIZER_FREQUENCIES.len()],
      error: None,
    }
  }
}

impl SpectrumState {
  fn start(&self) {
    let mut shared = self.shared.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if shared.started {
      return;
    }

    shared.started = true;
    let state = self.clone();

    std::thread::Builder::new()
      .name("audio-spectrum".to_string())
      .spawn(move || {
        if let Err(error) = capture_loop(&state) {
          let mut shared = state.shared.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
          shared.error = Some(error);
        }
      })
      .ok();
  }

  fn snapshot(&self) -> Result<AudioSpectrum, String> {
    self.start();
    let shared = self.shared.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(error) = &shared.error {
      return Err(error.clone());
    }

    Ok(AudioSpectrum {
      frequencies: EQUALIZER_FREQUENCIES.to_vec(),
      levels: shared.levels.to_vec(),
    })
  }

  fn update(&self, levels: [f32; EQUALIZER_FREQUENCIES.len()]) {
    let mut shared = self.shared.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    shared.levels = levels;
  }
}

#[tauri::command]
pub fn audio_spectrum(state: tauri::State<'_, SpectrumState>) -> Result<AudioSpectrum, String> {
  state.snapshot()
}

fn open_capture_client() -> Result<AudioClient, String> {
  let format = WaveFormat::new(
    32,
    32,
    &SampleType::Float,
    SAMPLE_RATE as usize,
    CHANNELS as usize,
    None,
  );

  // 优先只抓本应用的进程树；旧系统不支持时退回默认播放设备回环。
  let (mut client, direction) = match AudioClient::new_application_loopback_client(
    std::process::id(),
    true,
  ) {
    Ok(client) => (client, Direction::Capture),
    Err(_) => {
      let enumerator =
        DeviceEnumerator::new().map_err(|error| format!("音频设备枚举失败: {error}"))?;
      let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|error| format!("找不到默认播放设备: {error}"))?;
      let client = device
        .get_iaudioclient()
        .map_err(|error| format!("打开播放设备失败: {error}"))?;
      (client, Direction::Render)
    }
  };

  let mode = StreamMode::EventsShared {
    autoconvert: true,
    buffer_duration_hns: 0,
  };
  client
    .initialize_client(&format, &direction, &mode)
    .map_err(|error| format!("初始化音频回环失败: {error}"))?;

  Ok(client)
}

fn capture_loop(state: &SpectrumState) -> Result<(), String> {
  let _ = initialize_mta();

  let client = open_capture_client()?;
  let event = client
    .set_get_eventhandle()
    .map_err(|error| format!("创建音频事件失败: {error}"))?;
  let capture = client
    .get_audiocaptureclient()
    .map_err(|error| format!("读取音频回环客户端失败: {error}"))?;
  let block_align = WaveFormat::new(
    32,
    32,
    &SampleType::Float,
    SAMPLE_RATE as usize,
    CHANNELS as usize,
    None,
  )
  .get_blockalign() as usize;
  let wanted_bytes = block_align * WINDOW_FRAMES;
  let mut queue = VecDeque::with_capacity(wanted_bytes * 2);
  let mut smoothed = [0.0_f32; EQUALIZER_FREQUENCIES.len()];

  client
    .start_stream()
    .map_err(|error| format!("启动音频回环失败: {error}"))?;

  loop {
    let available = capture
      .get_next_packet_size()
      .map_err(|error| format!("读取音频包大小失败: {error}"))?
      .unwrap_or(0);

    if available > 0 {
      capture
        .read_from_device_to_deque(&mut queue)
        .map_err(|error| format!("读取音频回环数据失败: {error}"))?;
    }

    while queue.len() >= wanted_bytes {
      let bytes: Vec<u8> = queue.drain(..wanted_bytes).collect();
      let measured = compute_bands(&bytes, SAMPLE_RATE, CHANNELS, &EQUALIZER_FREQUENCIES);

      for (index, value) in measured.into_iter().enumerate() {
        let attack = if value > smoothed[index] { 0.58 } else { 0.2 };
        smoothed[index] += (value - smoothed[index]) * attack;
      }

      state.update(smoothed);
    }

    // 静音或暂停时可能长时间没有新数据；这不是故障，继续等下一包。
    let _ = event.wait_for_event(1000);

    std::thread::sleep(Duration::from_millis(2));
  }
}

/// 每个频点用 Goertzel 算法取能量。10 段总共只有几万次乘加，
/// 比引入 FFT 依赖更轻，也足够驱动这种小频谱。
fn compute_bands(
  bytes: &[u8],
  sample_rate: u32,
  channels: u16,
  frequencies: &[u32],
) -> [f32; EQUALIZER_FREQUENCIES.len()] {
  let mut mono = Vec::with_capacity(bytes.len() / 4 / channels as usize);
  let channel_count = channels.max(1) as usize;

  for frame in bytes.chunks_exact(4 * channel_count) {
    let mut sum = 0.0_f32;
    for channel in 0..channel_count {
      let offset = channel * 4;
      sum += f32::from_le_bytes([
        frame[offset],
        frame[offset + 1],
        frame[offset + 2],
        frame[offset + 3],
      ]);
    }
    mono.push(sum / channel_count as f32);
  }

  let mut result = [0.0_f32; EQUALIZER_FREQUENCIES.len()];

  for (index, frequency) in frequencies.iter().enumerate().take(result.len()) {
    result[index] = goertzel_level(&mono, sample_rate, *frequency as f64);
  }

  result
}

fn goertzel_level(samples: &[f32], sample_rate: u32, frequency: f64) -> f32 {
  if samples.is_empty() {
    return 0.0;
  }

  let length = samples.len() as f64;
  let omega = 2.0 * std::f64::consts::PI * frequency / sample_rate as f64;
  let coefficient = 2.0 * omega.cos();
  let mut previous = 0.0_f64;
  let mut previous_two = 0.0_f64;

  for (index, sample) in samples.iter().enumerate() {
    let window =
      0.5 - 0.5 * (2.0 * std::f64::consts::PI * index as f64 / (length - 1.0)).cos();
    let current = *sample as f64 * window + coefficient * previous - previous_two;
    previous_two = previous;
    previous = current;
  }

  let power = (previous * previous + previous_two * previous_two
    - coefficient * previous * previous_two)
    .max(0.0)
    / (length * length);
  let decibels = 10.0 * (power + 1e-12).log10();
  ((decibels + 66.0) / 54.0).clamp(0.0, 1.0) as f32
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sine_wave(frequency: f64) -> Vec<u8> {
    let frames = 4096;
    let mut bytes = Vec::with_capacity(frames * 8);

    for frame in 0..frames {
      let sample =
        (2.0 * std::f64::consts::PI * frequency * frame as f64 / SAMPLE_RATE as f64).sin() as f32;
      for _ in 0..CHANNELS {
        bytes.extend_from_slice(&sample.to_le_bytes());
      }
    }

    bytes
  }

  #[test]
  fn silence_stays_at_zero() {
    let bands = compute_bands(
      &vec![0_u8; WINDOW_FRAMES * 8],
      SAMPLE_RATE,
      CHANNELS,
      &EQUALIZER_FREQUENCIES,
    );

    assert!(bands.iter().all(|level| *level < 0.001));
  }

  #[test]
  fn a_tone_lights_the_matching_band() {
    let bands = compute_bands(
      &sine_wave(1000.0),
      SAMPLE_RATE,
      CHANNELS,
      &EQUALIZER_FREQUENCIES,
    );
    let loudest = bands
      .iter()
      .enumerate()
      .max_by(|left, right| left.1.total_cmp(right.1))
      .map(|(index, _)| index)
      .expect("至少有一个频段");
    let expected = EQUALIZER_FREQUENCIES
      .iter()
      .position(|frequency| *frequency == 1000)
      .expect("1000 Hz 在均衡器频点里");

    assert_eq!(loudest, expected, "频谱应点亮 1000 Hz 对应频段");
  }
}
