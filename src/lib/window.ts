import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './backend'

/**
 * 把主窗口显示出来。
 *
 * 主窗口在 tauri.conf.json 里是 `visible: false`，为的是启动时不要先闪一个空窗口。
 * 前端把开屏的第一帧画好之后再调这里，用户看到的第一眼就已经是开屏本身。
 * 浏览器里跑（端到端测试）时不需要，直接跳过。
 */
export async function revealMainWindow(): Promise<void> {
  if (!isTauri()) {
    return
  }

  await invoke('reveal_window')
}
