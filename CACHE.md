# 进度缓存

每次改完代码都更新这里：这一段做完了什么、下一步该做什么。

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

## 下一阶段：还没定

目录区现在把「选目录 → 进盘 → 进去 → 挑视频」这条线走顺了。顺着往下最省事的是**记住上次的位置**：

- 记住上次打开的目录，启动后直接铺回方格墙，开屏收场就不再是空画面；
- 顺带记住每个视频的播放进度，下次点开接着放（README 的「已知限制」里也列着这条）。

另外还可以做：方格墙按名称/时间排序、搜索框；把开屏时长做成设置项；M3 多主题 token。

以上都等确认后再动。
