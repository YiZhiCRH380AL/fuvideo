//! 输入设备：摄像头 / 采集卡 / 麦克风。
//!
//! mpv 自己不提供设备枚举，但它能通过 ffmpeg 的 dshow 输入打开设备：
//! `av://dshow:video=<友好名字>` 或 `av://dshow:audio=<友好名字>`。
//! 这里用 Media Foundation 把设备友好名字列出来，界面拿它拼地址去放。

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDevices {
  /// 摄像头 / 采集卡的视频输入。
  pub cameras: Vec<String>,
  /// 麦克风 / 音频采集卡。
  pub microphones: Vec<String>,
}

/// 把设备名拼成 mpv 能吃的 dshow 地址。
///
/// ffmpeg 的 dshow 串里 `:` 分隔参数、`=` 赋值，名字里出现这两个字符要转义；
/// 反斜杠本身也得先转义，不然会把后面的转义吃掉。
pub fn dshow_url(kind: &str, name: &str) -> String {
  let escaped = name
    .replace('\\', r"\\")
    .replace(':', r"\:")
    .replace('=', r"\=");

  if kind == "audio" {
    format!("av://dshow:audio={escaped}")
  } else {
    format!("av://dshow:video={escaped}")
  }
}

/// 列出本机可用的输入设备。
///
/// 枚举失败（没有 Media Foundation、权限问题、干脆没装设备）一律返回空表——
/// 面板上显示「没有找到设备」就够了，不该因为这个弹错误。
#[tauri::command(async)]
pub fn capture_devices() -> CaptureDevices {
  enumerate()
}

#[cfg(windows)]
fn enumerate() -> CaptureDevices {
  use windows::Win32::Media::MediaFoundation::{
    MFShutdown, MFStartup,
    MFSTARTUP_LITE,
    MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_GUID, MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID,
    MF_VERSION,
  };
  use windows::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED,
  };

  let mut devices = CaptureDevices::default();

  unsafe {
    // MFStartup 负责初始化媒体平台；COM 单独起一份引用，退出时对应放掉。
    let com = CoInitializeEx(None, COINIT_MULTITHREADED).ok();

    if MFStartup(MF_VERSION, MFSTARTUP_LITE).is_err() {
      if com.is_ok() {
        CoUninitialize();
      }

      return devices;
    }

    devices.cameras = list_present_devices(MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID);
    devices.microphones = list_present_devices(MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_AUDCAP_GUID);

    let _ = MFShutdown();

    if com.is_ok() {
      CoUninitialize();
    }
  }

  devices
}

#[cfg(windows)]
unsafe fn list_present_devices(kind: windows::core::GUID) -> Vec<String> {
  use windows::core::PWSTR;
  use windows::Win32::Media::MediaFoundation::{
    IMFActivate, IMFAttributes, MFEnumDeviceSources, MFCreateAttributes,
    MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
  };
  use windows::Win32::System::Com::CoTaskMemFree;

  let mut names = Vec::new();
  let mut attributes: Option<IMFAttributes> = None;

  unsafe {
    if MFCreateAttributes(&mut attributes, 1).is_err() {
      return names;
    }

    let Some(attributes) = attributes else {
      return names;
    };

    if attributes
      .SetGUID(&MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE, &kind)
      .is_err()
    {
      return names;
    }

    let mut raw: *mut Option<IMFActivate> = std::ptr::null_mut();
    let mut count = 0u32;

    if MFEnumDeviceSources(&attributes, &mut raw, &mut count).is_err() || raw.is_null() {
      return names;
    }

    let slice = std::slice::from_raw_parts(raw, count as usize);

    for element in slice {
      // 把所有权接过来：数组本身随后整块 CoTaskMemFree，不能在这里 drop 源地址
      let activate = std::ptr::read(element);

      if let Some(activate) = activate {
        let mut name = PWSTR::null();
        let mut length = 0u32;

        if activate
          .GetAllocatedString(&MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, &mut name, &mut length)
          .is_ok()
        {
          let text = name.to_string().unwrap_or_default();

          if !text.trim().is_empty() {
            names.push(text);
          }

          CoTaskMemFree(Some(name.0 as *const std::ffi::c_void));
        }
      }
    }

    CoTaskMemFree(Some(raw as *const std::ffi::c_void));
  }

  names
}

#[cfg(not(windows))]
fn enumerate() -> CaptureDevices {
  CaptureDevices::default()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn camera_urls_use_the_dshow_video_input() {
    assert_eq!(
      dshow_url("video", "Integrated Camera"),
      "av://dshow:video=Integrated Camera"
    );
  }

  #[test]
  fn microphone_urls_use_the_dshow_audio_input() {
    assert_eq!(
      dshow_url("audio", "麦克风 (Realtek)"),
      "av://dshow:audio=麦克风 (Realtek)"
    );
  }

  /// 名字里带 `:` / `=` / `\` 时必须转义，否则 dshow 会把名字截断成参数。
  #[test]
  fn special_characters_are_escaped() {
    assert_eq!(
      dshow_url("video", r"USB: Cam=1\2"),
      r"av://dshow:video=USB\: Cam\=1\\2"
    );
  }

  /// 认不出来的 kind 按视频处理：界面上只有「摄像头 / 麦克风」两种。
  #[test]
  fn unknown_kind_falls_back_to_video() {
    assert!(dshow_url("", "Cam").starts_with("av://dshow:video="));
  }
}
