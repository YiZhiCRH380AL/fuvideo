# 进度缓存

每次改完代码都更新这里：这一段做完了什么、下一步该做什么。

## 当前阶段：开屏动画（已完成）

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

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（87 个）、
`npm run test:e2e`（6 个）、`npm run build`、`cd src-tauri && cargo test`（22 个）全绿。

## 下一阶段：还没定

开屏现在收场后落在空状态（「选一个目录…」）。顺着这条线往下做最省事的是**记住上次的位置**：

- 记住上次打开的目录，启动后直接铺回方格墙，开屏收场就不再是空画面；
- 顺带记住每个视频的播放进度，下次点开接着放（README 的「已知限制」里也列着这条）。

另外还可以做：把开屏时长/是否播放开屏做成设置项；M3 多主题 token。

以上都等确认后再动。
