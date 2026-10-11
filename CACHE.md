# 进度缓存

每次改完代码都更新这里：这一段做完了什么、下一步该做什么。

## 上一阶段：P0 地基（已完成）

这一阶段**不新增可见功能**，只把后面所有播放器能力都要踩的地基铺好。

- **常驻播放内核**：[mpv.rs](src-tauri/src/mpv.rs) 不再每播一个文件就 kill 再重启。
  第一次播放启动进程（`--idle=yes`），之后换片一律走 IPC 的 `loadfile`。音频设备、字幕、
  画面这些偏好因此天然跨片保留，换片也不用重新等启动、重新找窗口。
  子窗口的对齐与「压到底层」收在 `sync_embedded_window`：mpv 建窗是异步的，首次可能还没
  建出来，载入文件之后会再补一次。
- **优雅退出**：应用退出时先发 `quit` 再回收进程（超时 3 秒才强杀），mpv 才有机会把
  watch-later 落盘。watch-later 目录指向应用配置目录，不去动用户自己那份 `%APPDATA%\mpv`。
  目录在启动播放进程时提前建好——mpv 写不进去是静默失败，不建就等于「记住播放位置」悄悄失效。
  由此开启了「退出时记住播放位置」：同一个文件下次打开会从上次的位置接着播。
- **设置存储**：[settings.rs](src-tauri/src/settings.rs)。应用配置目录下的 `settings.json`，
  目前覆盖硬解、是否记住位置、字幕自动加载、字幕字号、声道布局、音频设备。
  约定是**默认值等于 mpv 默认行为的项写成 `Option`，`None` 就完全不传这个参数**，
  所以开箱行为和加设置之前一模一样；坏 JSON、缺字段、越界取值一律折回默认，不报错。
  面板还没做，但这些值已经会注入 mpv 的启动参数。
- **浮层面板骨架**：[Popover.tsx](src/components/Popover.tsx)。点外面收、Esc 收，锚点容器
  由调用方给。第一个使用者就是原来的倍速菜单，样式改名成 `.popover` / `.popover__item`，
  属性一字未改，所以外观与动画不变。App 里的面板状态由 `speedOpen` 改成 `openPanel`，
  空闲隐藏只看「有没有面板开着」，后面加音轨/字幕面板不必各接一遍。
- **低频详情通道**：`player_details` 命令返回轨道表（`track-list`）与当前真正生效的硬解后端
  （`hwdec-current`）。轨道表是数组，不塞进 300ms 一次的高频快照。界面侧客户端已就位，
  P1 的音轨/字幕面板直接用它。

覆盖到的测试：

- `src-tauri/src/settings.rs`：默认值、文件缺失、坏 JSON、往返、缺字段、白名单折回、
  字号区间、空设备名、camelCase 字段名。
- `src-tauri/src/mpv.rs`：启动参数（不带文件名、`--idle`、设置项按需注入、watch-later 路径）、
  `track-list` 解析、详情序列化，以及两条真实 mpv 的集成用例——同一进程连续 `loadfile` 换片、
  退出时写出 watch-later。
- `src-tauri/src/mpv/ipc.rs`：连接重试到点即放弃。
- `src/components/Popover.test.tsx`：开关、点外面、点锚点、点内容、Esc、关着时不监听。
- `src/App.controls.test.tsx`：倍速菜单按 Esc 收起。
- `src/lib/backend.test.ts`：浏览器环境下详情与设置的兜底。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（119 个）、
`npm run test:e2e`（7 个）、`npm run build`、`cd src-tauri && cargo test`（45 个）全绿。

**还没验证到的**：窗口嵌入属于原生子窗口那一层，自动化测试覆盖不到。这次改的是「什么时候
去找那个窗口」，需要真机 `npm run tauri dev` 点开一个视频确认画面正常。

**下一步（P1）**：音轨切换、外挂音轨、音频输出设备与独占模式、声道、音频延迟，以及外挂字幕
（手动挂载、轨道选择、双语、延迟与字号）。这一批全是 mpv 现成属性，界面复用这一阶段做好的
浮层骨架与 `player_details` 通道。

## 上一阶段：开屏动画（已完成）

开屏改成「窗口一露面就已经画好的浮层」，不再先闪一个空白窗口。

- **浮层**：[Splash.tsx](src/components/Splash.tsx) + [Splash.css](src/components/Splash.css)。
  顺序是：底色 → 环境光晕开 → logo 从模糊里化出来（带一道掠过的高光）→ 字标（字距由松到紧）
  → 底下那条运行状态线来回跑。
- **什么时候收场**：[splash.ts](src/lib/splash.ts) 的 `shouldLeaveSplash`。
  运行环境探完**并且**入场动画走完（`SPLASH_MIN_MS = 1150ms`）才收；环境一直探不出来就按
  `SPLASH_MAX_MS = 2600ms` 兜底放人进去，顶栏照旧提示内核状态。
- **交叉淡入**：收场时浮层往前推近一点再淡掉，界面的 `.shell` 同时淡入并轻微放大归位
  （两边都用 `--dur-splash = 460ms`，同长同曲线，中间不会闪出一块空底色）。
  `prefers-reduced-motion` 下这些动画全部关掉。
- **不闪白屏**：主窗口在 [tauri.conf.json](src-tauri/tauri.conf.json) 里改成 `visible: false`，
  前端把开屏第一帧画好后再调 `reveal_window` 让它露面。Rust 侧另有 3 秒兜底显示，
  前端万一没起来（脚本报错、开发服务器没起）也不会变成「看不见的窗口」。

覆盖到的测试：

- `src/lib/splash.test.ts`：收场条件（探完才收、必须过最短时长、兜底时长）。
- `src/components/Splash.test.tsx`：入场内容、等待、收场时序、探完即收、兜底收场。
- `src/App.test.tsx` / `e2e/smoke.spec.ts`：启动先放开屏、探完后退场并卸载。

## 上一阶段：侧边栏并进目录区（已完成）

侧边栏整个去掉了，目录浏览分成两处，都在中心区域里：

- **标题栏**：品牌 → 「选择目录」→ 面包屑（[Crumbs.tsx](src/components/Crumbs.tsx)）。
  点任意一层直接跳过去，层数超过三层就把前面的折成「…」，标题栏不会被长路径撑破。
  看画面时这一段整块收起（新目录里没有当前视频，放大格会消失）。
- **目录区**：上面一条文件夹（[FolderStrip.tsx](src/components/FolderStrip.tsx)），
  下面是方格墙。子目录原来在侧边栏里是一列文字，现在是和方格同一套视觉的小卡片，
  最前面固定一个「上一级」（到盘符根目录时置灰）。
- **方格墙**：从「无缝贴在一起」改成圆角卡片——16px 间距、1px 描边、悬停抬起并投影，
  文件名从画面上挪到画面下面，缩略图淡入、播放符号悬停浮出。
- **动效**：翻目录时文件夹和方格按索引错峰淡入（`--i` 变量控制延迟，最多错 8 个），
  面包屑新增的那一层从左边滑进来；展开/收起画面仍然走原来的 FLIP。
- **布局**：`.library` 变成两行网格（`auto minmax(0, 1fr)`），文件夹再多也只是把方格
  那一行压低并自己滚动，不会把内容挤出窗口。

覆盖到的测试：

- `src/lib/path.test.ts`：`pathSegments` 拆路径（盘符、根目录、混用分隔符、POSIX）。
- `src/App.controls.test.tsx`：目录区一节改写——文件夹条、面包屑跳转、深层折叠、
  取消选择、盘符根目录不能再往上；另外补了「展开时换目录入口一起收起」。
- `e2e/smoke.spec.ts`：改成「目录区占满整窗，不再有侧边栏」。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（94 个）、
`npm run test:e2e`（6 个）、`npm run build`、`cd src-tauri && cargo test`（22 个）全绿。

## 上一阶段：能换盘了（已完成）

之前从目录里一路点「上一级」只能停在自己那个盘：盘符根目录的 `parent` 是 null，
再往上没有地方可去，想开 C 盘、D 盘只能重新走一次系统选择框。

现在盘符根目录再往上是**「此电脑」**：

- **后端**：[library.rs](src-tauri/src/library.rs) 的 `available_drives()` 挨个试 `A:\`–`Z:\`
  能不能读，能读的才算（空光驱、没插卡的读卡器在盘符表里也在，但点进去只会报错，
  所以干脆不列出来）；新增 `list_drives` 命令，前端 `listDrives()` 调用。
- **入口**：文件夹条最前面那个固定位置，平时是「上一级」，站在盘符根目录时换成
  「此电脑」（图标也从箭头换成显示器）。到「此电脑」就把各盘铺成卡片，点进去直接开。
- **空状态**：引导页下面多了一个「浏览磁盘 · 打开单个视频」，没选过目录也能直接进盘。
- 切到「此电脑」和换目录一样，会先把正在播放的画面收起来——不然放大格消失、
  整窗还透明，画面就悬空了。

覆盖到的测试：

- `src-tauri/src/library.rs`：`available_drives_are_roots_that_can_actually_be_listed`
  （每个盘符都要真的列得出来，本机返回 C:–G:）。
- `src/App.controls.test.tsx`：盘符根目录入口变成「此电脑」、从盘符根目录切到别的盘。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（95 个）、
`npm run test:e2e`（6 个）、`npm run build`、`cd src-tauri && cargo test`（23 个）全绿。

## 当前阶段：上下集与首次教程（已完成）

补了两个用起来最常缺的东西：

- **灵动岛上的上下集**（[Island.tsx](src/components/Island.tsx)）：
  播放/暂停右边多了 ⏮ / ⏭，按**方格墙里的顺序**换片——也就是「下一集」永远是眼睛看到
  右边那一格。到头就置灰，鼠标悬停会提示「上一集 · ep01.mkv」。实现上直接复用
  `playPath`，不重新走幕布转场，换片是立刻的。
- **首次进入的教程**（[Tutorial.tsx](src/components/Tutorial.tsx)）：四步讲清楚选目录/进盘、
  点方格放大播放、灵动岛上都有些什么、键盘快捷键。看过一次记在 localStorage
  （[tutorial.ts](src/lib/tutorial.ts)）不再自动弹，标题栏右上角的 **?** 随时能叫回来；
  Esc、右上角 ✕、点背景都能关。

为什么没用现成的引导库：driver.js（MIT）、react-joyride（MIT）都是「高亮页面上某个元素」
式的引导，而第一次打开时方格墙和灵动岛都还没出现，没有东西可以指，所以用分步卡片自己写。

覆盖到的测试：

- `src/lib/tutorial.test.ts`：看到没看到、本地存储读/写失败时的兜底。
- `src/components/Tutorial.test.tsx`：翻页、退回、走完记录、Esc / ✕ 关闭。
- `src/App.controls.test.tsx`：上下集按墙里顺序换片与置灰、首次弹教程、关掉后不再弹、「?」能叫回来。
- `e2e/smoke.spec.ts`：首次进入自动弹教程 → 走完 → 刷新不再弹。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（108 个）、
`npm run test:e2e`（7 个）、`npm run build`、`cd src-tauri && cargo test`（23 个）全绿。

## 当前产物（0.1.1-Alpha）

版本号带 `-Alpha`，MSI 目标不接受非数字的预发布号，所以只打 NSIS：

```
npm run tauri build -- --bundles nsis
```

| 产物 | 位置 | 大小 |
| --- | --- | --- |
| 主程序 | `src-tauri/target/release/fuvideo.exe` | 9.0 MB |
| 安装包 | `src-tauri/target/release/bundle/nsis/fuvideo_0.1.1-Alpha_x64-setup.exe` | 36.1 MB |

`target/` 在 `.gitignore` 里，产物不进仓库；要发布得手动传到 Releases
（本机没装 `gh`，走网页上传，或者装上 `gh` 之后 `gh release create`）。

## 路线图：播放器能力扩展（P0 已完成，下一步 P1）

目标：把 mpv 已经具备、但界面没有暴露出来的播放器能力分批接出来，功能面对标 PotPlayer；
**但不改画面渲染链，也不改现有外观与动效**。这一节是路线图，动手前先看下面的调研结论和设计约束。

### 调研结论（已在本机核实过，不用再查一遍）

- 内核是 mpv **v0.41.0**（shinchiro 构建，FFmpeg 带 libavdevice），经 `--wid` 嵌入 + 命名管道 JSON IPC 控制。
- `--hwdec=help` 列出的后端只是**编译期的合法取值**，不代表本机能用：实际可用性由 GPU 决定
  （本机是 RTX 4090 + AMD 核显，`qsv` 不可用）。运行时真正生效的后端看 `hwdec-current` 属性。
  另外要分清**解码**和**编码**：mpv 播放只解码；硬件编码（NVENC/QSV/AMF）只有在导出新文件时才涉及。
- 音频输出只有 `wasapi / openal / null / pcm`：**没有 ASIO、也没有 DirectSound**，
  独占模式只能靠 `audio-exclusive`。
- mpv 已移除 `--video-stereo-mode`（0.41 的选项表里不存在）→ **3D 立体输出做不到**。
- `--sub-auto` 默认就是 `exact`：同名外挂字幕**本来就会自动加载**，缺的只是界面和模糊匹配。
- `watch-later-options` 默认就记录 `aid`、`sid`、`sub-delay`、`video-zoom`、`brightness`、`ab-loop` 等，
  也就是「每部片子记住自己选过的音轨/字幕/画面设置」是 mpv 的原生能力。但现在换片是直接 `kill` 进程
  （`PlayerState::replace`），这种机制根本来不及落盘。
- 已确认存在的能力举例：`audio-device-list`、`audio-channels`、`audio-spdif`、`secondary-sid`、
  `chapter-list`、`playlist*`、`ab-loop-a/b`、`screenshot`（jpg/png/webp/jxl/avif）、`--stream-record`、
  `--dvd-device` / `--bluray-device`、`--ytdl`；音频滤镜 `superequalizer`(18 段)、`loudnorm`、
  `scaletempo2`、`surround`、`channelmap`；视频滤镜 `crop` / `rotate` / `eq` / `unsharp` / `hqdn3d` /
  `deband` / `delogo` / `v360` / `libplacebo`。

### 设计约束（每个阶段都要守）

- 画面由 mpv 原生子窗口渲染，字幕由 libass 画在视频层；新功能一律走 HTML 覆盖层，不碰这两条链路。
- 新面板复用现有倍速菜单（`.speed-menu`）的浮层形态与 CSS 变量；`prefers-reduced-motion` 下动画关掉。
- 新面板必须接进 `useIdleVisibility` 的判据（现在只有 `!speedOpen`），否则鼠标停在面板上界面会自己隐去。
- 高频快照 `player_state` 不再加字段；轨道表、设备表这类列表数据走独立的低频通道。

### P0 地基（已完成，见上面「上一阶段：P0 地基」）

1. 常驻 mpv + `loadfile`，替掉「每片 kill + 重启」。收益：设备/字幕/画面偏好天然跨片保留，
   换片不再重启内核，也不用每次重新找子窗口。
2. 优雅退出：用 `quit` 命令代替 `kill`，让 `watch-later` 能落盘，顺手解决「上次看到哪」。
3. 设置持久化：应用配置目录下的 JSON 存全局偏好与默认值，播放时注入启动参数，
   或在 IPC 连上后立刻写属性。
4. 面板骨架：统一的浮层组件 + 关闭逻辑 + 空闲隐藏判据 + 键盘可达。
5. 低频详情通道：新增 `player_details` 一类命令（轨道表、设备表、章节表），与高频快照分离。

验收：`cargo test` 覆盖常驻内核的 loadfile / quit / watch-later；Vitest 覆盖设置读写与面板开关；
e2e 覆盖「打开面板时界面不会隐去」。

### P1 音频与字幕（最高频，全是 mpv 现成能力）

- 音轨：`track-list` / `aid` / `alang`；外挂音轨 `audio-add` / `--audio-file-auto`。
- 输出设备：`audio-device` + `audio-device-list`（显示 description，不是内部 name）；
  独占模式 `audio-exclusive`（要明确提示会独占设备）。
- 声道：`audio-channels`（mono/stereo/5.1/7.1），进阶 `audio-channel-map`；音频延迟 `audio-delay`。
- 字幕：手动添加 `sub-add`，轨道选择 `sid` / `secondary-sid`（双语），
  `sub-delay` / `sub-pos` / `sub-scale` / `sub-font-size` / `sub-ass-override`；
  自动加载 `--sub-auto=fuzzy` + `--sub-file-paths`。
- 以上选择都要跨片保持（依赖 P0）。

风险：切换输出设备会重建音频管线，有短暂断音，个别驱动下可能失败——需要提示与回退。

### P2 音频进阶

- 均衡器 `superequalizer`（18 段）+ 预设；响度归一化 `loudnorm` / `dynaudnorm`。
- 变速不变调 `scaletempo2` / `rubberband` + `audio-pitch-correction`。
- 立体声扩展 `extrastereo`、环绕上混 `surround`、声道重映射 `channelmap` / `pan`。
- 透传 `audio-spdif`（AC3/DTS/EAC3/TrueHD/DTS-HD）；采样率与位深 `audio-samplerate` / `audio-format`。

### P3 画面

- 缩放与画幅：`video-zoom` / `panscan` / `video-aspect-override` / `video-align-x,y`。
- 色彩：`brightness` / `contrast` / `saturation` / `hue` / `gamma`。
- 几何：`video-rotate` / `hflip` / `vflip` / `crop` / `cropdetect`。
- 画质档位：`deband` / `sharpen` / `interpolation` / `tscale` / `icc-profile-auto`。
- 硬解：`hwdec` 下拉（自动 / d3d11va / nvdec / amf / 关闭），并用 `hwdec-current` 显示**实际生效**的后端，
  不要把那一百多个名字铺开。
- HDR：`tone-mapping` / `target-peak` / `hdr-contrast-recovery`。
- 快照：`screenshot`（jpg/png/webp/jxl/avif，可带或不带字幕），可指定保存目录。
- 可选：`v360` 做 360° 视角（VR 头显不支持）。

### P4 播放控制与应用层

- 播放列表与队列 `playlist*` / `loadlist`；循环与随机 `loop-file` / `loop-playlist` / `shuffle`。
- 章节 `chapter-list` / `chapter`；逐帧 `frame-step` / `frame-back-step`。
- AB 循环 `ab-loop-a` / `ab-loop-b` / `ab-loop-count`。
- 记忆播放位置与播放历史（依赖 P0 的 watch-later）；书签（mpv 无此能力，应用层自己存）。
- 定时关闭 / 定时暂停（应用层）。
- 快捷键自定义（现在 `--input-default-bindings=no`，按键全由前端 `resolveShortcut` 处理）。
- 窗口行为：迷你模式、置顶、透明度（Tauri 窗口属性）。
- 打开方式：拖放、打开 URL、加载外部音频。
- 顺带把之前列过的小项做掉：记住上次目录、方格墙排序与搜索、开屏时长做成设置项、M3 主题 token。

### P5 内容来源与新依赖（需要先决策）

- 网络流 http/rtsp/rtmp/udp：内核支持，不引入新依赖。
- 在线视频 `--ytdl`：需要外部 `yt-dlp` 可执行文件 + 网络，包体和网络边界要先定。
- 光盘 `--dvd-device` / `--bluray-device`：能读盘，**没有导航菜单**。
- 输入设备采集 `av://dshow:...`：mpv **不提供设备枚举**，要自己写 WASAPI / Media Foundation 枚举，
  是这一阶段唯一的系统级新代码。
- 边播边录 `--stream-record`：流复制，不重编码，不需要编码器。

### 明确不做（连同理由一起记下）

- 在线字幕搜索/下载、实时字幕翻译：mpv 没有，需要第三方服务与密钥。
- 字幕时间轴编辑器：等于新写一个编辑器，超出播放器范围。
- DTV 电视广播（DVB 调谐器）：mpv 不支持。
- 3D 立体输出：mpv 0.41 已移除 `video-stereo-mode`。
- ASIO 输出：本机 mpv 的音频输出只有 wasapi/openal/null/pcm。
- DirectShow 滤镜图管理（PotPlayer 挂 LAV/madVR 的那套）：架构不同，没有对应概念。
- 蓝光导航菜单；皮肤文件生态（改为 HTML 主题 token）。

### 待决策（开工前要拍板）

1. 设置入口形态：以抽屉面板为主，还是以右键菜单为主？这决定信息架构，也决定它像不像 PotPlayer。
2. 是否引入网络能力（yt-dlp / 在线字幕）：会带来外部依赖与包体增长。
3. 「输入设备」到底指什么：采集卡当播放源、麦克风监听、还是录屏？三条路径的实现完全不同。
