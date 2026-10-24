export const INTRO_FPS = 30;
export const INTRO_WIDTH = 1920;
export const INTRO_HEIGHT = 1080;
export const WATERMARK_TEXT = "By IkariShinji";
export const RELEASE_NOTICE = "已发布预览版，详情见视频简介";
export const TRANSITION_DURATION_IN_FRAMES = 18;

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

export type IntroScene = {
  id: string;
  kind: IntroSceneKind;
  visual: IntroVisual;
  kicker: string;
  title: string;
  description: string;
  points: readonly string[];
  releaseNotice?: string;
  accent: string;
  accentAlt: string;
  durationInFrames: number;
};

// Every scene is rendered as a code-native FutureVideo interface mockup.
// Durations are tuned for a calm 150-second read, not for feature-list speed.
export const INTRO_SCENES = [
  {
    id: "opening",
    kind: "opening",
    visual: "launch",
    kicker: "FUTUREVIDEO / 0.3.0 ALPHA",
    title: "把本地片库\n变成私人影院",
    description: "没有广告，没有推荐流。只留下你真正想看的每一帧。",
    points: ["完全本地", "开箱即用", "无推荐流"],
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 405,
  },
  {
    id: "library",
    kind: "feature",
    visual: "library",
    kicker: "01 / LIBRARY",
    title: "一个目录\n就是一座片库",
    description:
      "把视频目录交给 FutureVideo，子目录、影片、封面与格式标签会自动铺成画廊。",
    points: ["子目录自动成片库", "编号 / 格式 / 时长一目了然", "侧栏悬停展开，移开自动收起"],
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 546,
  },
  {
    id: "playback",
    kind: "feature",
    visual: "playback",
    kicker: "02 / PLAYBACK",
    title: "点开即播\n每一帧都跟得上",
    description:
      "双击左右半屏快退或快进；拖动进度，先出现近似缩略图，再替换成当前位置的精确帧。",
    points: ["即时缩略图预览", "精确帧替换", "双击画面跳转 10 秒"],
    accent: "#6ce5e8",
    accentAlt: "#7c9cff",
    durationInFrames: 570,
  },
  {
    id: "collections",
    kind: "feature",
    visual: "collections",
    kicker: "03 / COLLECTIONS",
    title: "收藏\n不必塞进同一个盒子",
    description:
      "快速收藏之外，还能建立任意命名的收藏夹。一个视频可以同时属于多个收藏。",
    points: ["快速收藏", "任意命名收藏夹", "一个视频加入多个收藏"],
    accent: "#b79cff",
    accentAlt: "#ff83b7",
    durationInFrames: 540,
  },
  {
    id: "tools",
    kind: "feature",
    visual: "tools",
    kicker: "04 / CONTROL ROOM",
    title: "这一轮要用的\n都收在播放工具里",
    description:
      "章节、书签、AB 循环、定时关闭、窗口置顶和迷你模式集中管理；常用操作都放在底部灵动岛。",
    points: ["章节与书签", "AB 循环与定时", "窗口置顶 / 迷你模式"],
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 555,
  },
  {
    id: "audio",
    kind: "feature",
    visual: "audio",
    kicker: "05 / AUDIO & SUBTITLES",
    title: "多音轨与字幕\n对齐同一帧",
    description:
      "切换音轨、输出设备与声道，调整音频延迟；外挂字幕、第二字幕、字号和位置也能直接在播放器里改。",
    points: ["多音轨与输出设备", "外挂字幕 / 双语字幕", "10 段均衡器与实时频谱"],
    accent: "#6ce5e8",
    accentAlt: "#7c9cff",
    durationInFrames: 600,
  },
  {
    id: "appearance",
    kind: "feature",
    visual: "themes",
    kicker: "06 / MAKE IT YOURS",
    title: "六套主题\n给你的片库\n换种颜色",
    description:
      "极夜、余烬、苔原、潮汐、莓果、日光。完整、轻量、关闭三档动效，窗口变窄时重新排版。",
    points: ["六套主题", "三档动效", "响应式布局"],
    accent: "#ffd166",
    accentAlt: "#ff8a5b",
    durationInFrames: 600,
  },
  {
    id: "outro",
    kind: "outro",
    visual: "release",
    kicker: "FUTUREVIDEO 0.3.0 ALPHA",
    title: "你的片库\n你的颜色",
    description:
      "Windows 10 / 11 本地视频播放器。安装后开箱即用，不需要另装播放器或解码器。",
    points: ["github.com/YiZhiCRH380AL/fuvideo", "Windows 10 / 11 x64", "完全本地播放"],
    releaseNotice: RELEASE_NOTICE,
    accent: "#7c9cff",
    accentAlt: "#6ce5e8",
    durationInFrames: 810,
  },
] as const satisfies readonly IntroScene[];

export const INTRO_TRANSITION_COUNT = INTRO_SCENES.length - 1;

export const INTRO_DURATION_IN_FRAMES =
  INTRO_SCENES.reduce((total, scene) => total + scene.durationInFrames, 0) -
  INTRO_TRANSITION_COUNT * TRANSITION_DURATION_IN_FRAMES;

export const INTRO_DURATION_IN_SECONDS =
  INTRO_DURATION_IN_FRAMES / INTRO_FPS;
