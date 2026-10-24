export const INTRO_FPS = 30;
export const INTRO_BPM = 120;
export const INTRO_WIDTH = 1920;
export const INTRO_HEIGHT = 1080;
export const WATERMARK_TEXT = "By IkariShinji";
export const RELEASE_NOTICE = "已发布预览版，详情见视频简介";
export const TRANSITION_DURATION_IN_FRAMES = 15;

export type IntroSceneKind = "opening" | "feature" | "outro";

export type IntroVisual =
  | "launch"
  | "library"
  | "playback"
  | "collections"
  | "tools"
  | "audio"
  | "themes"
  | "release";

export type IntroLayout =
  | "hero"
  | "canvas"
  | "cinema"
  | "orbit"
  | "mosaic"
  | "wave"
  | "palette"
  | "end";

export type IntroScene = {
  id: string;
  kind: IntroSceneKind;
  visual: IntroVisual;
  layout: IntroLayout;
  kicker: string;
  title: string;
  description: string;
  points: readonly string[];
  releaseNotice?: string;
  accent: string;
  accentAlt: string;
  durationInFrames: number;
};

// The edit is locked to a 120 BPM half-beat grid. Every scene duration and
// transition is a multiple of 15 frames, so each cut lands on a musical pulse.
// Eight product beats walk through real actions instead of listing features.
export const INTRO_SCENES = [
  {
    id: "opening",
    kind: "opening",
    visual: "launch",
    layout: "hero",
    kicker: "FUTUREVIDEO 0.3.0 / WINDOWS",
    title: "拖进来\n就是片库",
    description:
      "本地文件、网络直链与摄像头，都收进同一块私人屏幕。",
    points: ["本地 / 网络 / 摄像头", "内置 mpv", "无广告 · 无推荐"],
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 210,
  },
  {
    id: "library",
    kind: "feature",
    visual: "library",
    layout: "canvas",
    kicker: "01 / LIBRARY",
    title: "拖入目录\n自动铺成片库",
    description:
      "视频、子文件夹、封面与格式标签自动整理；搜索、排序和侧栏都在这一屏。",
    points: ["拖放目录", "三列海报墙", "搜索 / 排序 / 侧栏"],
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 345,
  },
  {
    id: "playback",
    kind: "feature",
    visual: "playback",
    layout: "cinema",
    kicker: "02 / PLAYBACK",
    title: "拖动进度\n先有画面，再对准帧",
    description:
      "悬停进度条先看近似缩略图，抓取完成立即换成当前时间点的精确帧。",
    points: ["≈ 近似缩略图", "精确帧替换", "双击前后跳 10 秒"],
    accent: "#6ce5e8",
    accentAlt: "#7c9cff",
    durationInFrames: 360,
  },
  {
    id: "collections",
    kind: "feature",
    visual: "collections",
    layout: "orbit",
    kicker: "03 / COLLECTIONS",
    title: "一个视频\n放进多个收藏夹",
    description:
      "打开“收藏到”面板，快速收藏与命名收藏夹逐项勾选，彼此不会覆盖。",
    points: ["快速收藏", "命名收藏夹", "多选归属"],
    accent: "#b79cff",
    accentAlt: "#ff83b7",
    durationInFrames: 330,
  },
  {
    id: "tools",
    kind: "feature",
    visual: "tools",
    layout: "mosaic",
    kicker: "04 / CONTROL ROOM",
    title: "章节、书签、AB 循环\n都在播放工具",
    description:
      "设好 A 点与 B 点就能循环同一段；定时、置顶和迷你模式也在旁边。",
    points: ["章节 / 书签", "A-B 区间循环", "定时 / 置顶 / 迷你"],
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 330,
  },
  {
    id: "audio",
    kind: "feature",
    visual: "audio",
    layout: "wave",
    kicker: "05 / AUDIO & SUBTITLES",
    title: "双字幕 + 多音轨\n对齐同一帧",
    description:
      "内封与挂载音轨、双语字幕、延迟和字号在播放器里直接切换。",
    points: ["内封 / 外挂字幕", "第二字幕双语", "10 段均衡器 / 实时频谱"],
    accent: "#6ce5e8",
    accentAlt: "#7c9cff",
    durationInFrames: 375,
  },
  {
    id: "appearance",
    kind: "feature",
    visual: "themes",
    layout: "palette",
    kicker: "06 / MAKE IT YOURS",
    title: "六套主题\n三档动效",
    description:
      "极夜、余烬、苔原、潮汐、莓果、日光；窗口变窄时重新排版。",
    points: ["极夜 / 余烬 / 苔原", "潮汐 / 莓果 / 日光", "完整 / 轻量 / 关闭"],
    accent: "#ffd166",
    accentAlt: "#ff8a5b",
    durationInFrames: 330,
  },
  {
    id: "outro",
    kind: "outro",
    visual: "release",
    layout: "end",
    kicker: "FUTUREVIDEO 0.3.0 ALPHA",
    title: "你的片库\n你的颜色",
    description:
      "Windows 10 / 11 本地视频播放器。片库、字幕、音效与收藏都留在本机。",
    points: ["Windows 10 / 11 x64", "本地片库 / 网络流", "0.3.0 Alpha"],
    releaseNotice: RELEASE_NOTICE,
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 345,
  },
] as const satisfies readonly IntroScene[];

export const INTRO_TRANSITION_COUNT = INTRO_SCENES.length - 1;

export const INTRO_SCENE_STARTS_IN_FRAMES = INTRO_SCENES.map((_, index) =>
  INTRO_SCENES.slice(0, index).reduce(
    (total, scene) => total + scene.durationInFrames,
    0,
  ) -
  index * TRANSITION_DURATION_IN_FRAMES,
);

export const INTRO_SCENE_STARTS_IN_SECONDS =
  INTRO_SCENE_STARTS_IN_FRAMES.map((frame) => frame / INTRO_FPS);

export const INTRO_DURATION_IN_FRAMES =
  INTRO_SCENES.reduce((total, scene) => total + scene.durationInFrames, 0) -
  INTRO_TRANSITION_COUNT * TRANSITION_DURATION_IN_FRAMES;

export const INTRO_DURATION_IN_SECONDS =
  INTRO_DURATION_IN_FRAMES / INTRO_FPS;
