/** 首次进入的教程看过没有，存在本地。 */

const STORAGE_KEY = 'fuvideo:tutorial-seen'

/** 是否还需要弹教程。读不到本地存储时不弹：宁可不教，也别每次启动都盖一层。 */
export function hasSeenTutorial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

/** 记下「看过了」。存不下来也不影响使用，只是下次还会弹。 */
export function markTutorialSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // 无痕模式之类的情况：忽略
  }
}
