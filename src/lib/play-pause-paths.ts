/**
 * 播放与暂停图标的路径。
 *
 * 两个状态都写成「两个四边形」：结构一致，浏览器才能对路径做插值。
 * 播放态是三角形沿 x=14.5 切成左右两半（各是一个四边形），
 * 暂停态是两根竖条。于是形变看起来就是两半合拢成三角形、或者裂开成两根条。
 *
 * 注意不能把暂停画成一条 8 点闭合折线——那样第一根的左下角会直接连到
 * 第二根的左上角，nonzero 填充下会变成自交的蝴蝶形，不是两根条。
 */
const PLAY_LEFT: Array<[number, number]> = [
  [9, 5],
  [14.5, 8.5],
  [14.5, 15.5],
  [9, 19],
]

const PLAY_RIGHT: Array<[number, number]> = [
  [14.5, 8.5],
  [20, 12],
  [20, 12],
  [14.5, 15.5],
]

const PAUSE_LEFT: Array<[number, number]> = [
  [8, 5],
  [11, 5],
  [11, 19],
  [8, 19],
]

const PAUSE_RIGHT: Array<[number, number]> = [
  [16, 5],
  [19, 5],
  [19, 19],
  [16, 19],
]

function toQuad(points: Array<[number, number]>): string {
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
}

/** 暂停中（点一下会开始播放）时显示的三角形。 */
export const PLAY_PATH = `${toQuad(PLAY_LEFT)} ${toQuad(PLAY_RIGHT)}`

/** 播放中（点一下会暂停）时显示的两根竖条。 */
export const PAUSE_PATH = `${toQuad(PAUSE_LEFT)} ${toQuad(PAUSE_RIGHT)}`
