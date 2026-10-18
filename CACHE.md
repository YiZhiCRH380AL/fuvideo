# 进度缓存

每次改完代码都更新这里：这一段做完了什么、下一步该做什么。

## 上一阶段：窄窗口体检 + 记住音量与倍速

**窄窗口体检**（本来在上一节的「下一步」里）

- 新加两条 e2e，把浏览器视口设成迷你模式的真实尺寸逐项量：
  **560×315**（迷你模式）与 **640×400**（主窗口尺寸下限）。
- 量的是：灵动岛整块是否留在视口里、里面那排控件有没有横向撑出去
  （`scrollWidth - clientWidth ≤ 1`）、`⋮` 面板四边是否出界、能不能滚。
- 结论：**两个尺寸都过**，不用改布局。截图在
  `test-results/shots/narrow-560.png` / `narrow-640.png`。
  560 宽时面板只露出前两节、要靠滚动看下面——这是预期的（`overflow-y: auto`）。

**记住音量与倍速**

- settings 多了 `volume` / `speed`（默认 `None` = 没设置过）。
- 写：**退出时**由 `lib.rs` 读一次 mpv 的 `volume` / `speed` 再落盘
  （`PlayerState::playback_prefs`；这次没播过就不写，别拿默认值覆盖上次的）。
- 读：`build_player_args` 把它们作为 `--volume=` / `--speed=` 传给启动的 mpv。
- 归一化：音量 0–100、倍速 0.25–4，越界折回、NaN 当没设置。
- 没做「每次拖动就落盘」：拖动会一秒写几十次文件，退出时记一次就够。

验证：Rust **121**（新增 1 条归一化用例）、前端 240、e2e **19**（新增 2 条窄窗口）、
typecheck、build、lint 全绿。

## 上一阶段：列表清空与最近播放单条移除

- **一键清空**（播放列表 / 收藏夹）：面板顶上那颗「清空」按**两下**才生效——
  第一下变成红色的「确认清空？」并且什么也不做，第二下才调后端。
  两份列表是用户一条条攒出来的，误点全没太难受；面板一关状态就重置。
  后端 `clear_collection(kind)` 只清被点的那一侧，另一侧不动（有单测钉住）。
- **最近播放单条移除**：鼠标移到那一行才露出 ✕（和方格上的动作按钮一套做法），
  只去掉点名的那一条，别的条目与顺序都不动（`forget_recent` + `forget()` 单测）。
- 清空/移除之后都会回一句结果（「播放列表已清空」），不弹对话框。
- 验证：Rust **120**（新增 3 条）、前端 **240**（新增 2 条）、e2e 17、build、lint 全绿。

## 上一阶段：最近播放记录 + 播放工具换成 ⋮

- 顶栏那颗 🧰 换成 `⋮`：和 ≡ / ★ / ⚙ / ? 一样是单色字形，不再是彩色 emoji。
- 新增 `recent.json`（和 `collections.json` 分开放）：路径 + 最后播放时刻 + 停在第几秒。
  - 写入：`play_video` 打开文件时记一次（位置 0）；**换片前**与**退出时**用 mpv 的
    `time-pos` 更新进度（`PlayerState::remember_progress`）。
  - 读取：按时间倒序、按路径去重（留最新）、最多 20 条；坏 JSON 当空。
  - 面板顶部列出「最近播放」，点一条直接放（续播仍然交给 mpv 的 watch-later）；
    旁边一个「清空」。
- 分工写死在这儿，免得以后重复做：**watch-later 管「同一部片子回到上次位置」，
  recent.json 只管「最近看过哪几部、各自停在哪」**。
- **布局坑**：多了一节之后，`.popover--panel` 的 440px 上限会把「打开地址」压进滚动区
  （截图里看得到）。给工具面板单独加了 `.popover--tools`
  （`max-height: min(680px, calc(100vh - 96px))`），截图确认六节全部展得下。
- 验证：Rust **117**（新增 9 条 recent 用例）、前端 **238**（新增 2 条）、e2e 17、
  build、lint 全绿。

## 上一阶段：播放列表 / 收藏夹导出导入 .m3u8

- 面板顶上新两颗按钮：**导出 .m3u8**（两种列表都有）、**导入 .m3u8**（只有播放列表）。
  列表空的时候导出是禁用的（导一个空文件没有意义）。
- 导出格式：`#EXTM3U` + 一行一个绝对路径，**路径统一写成正斜杠**——
  Windows 上的 mpv / VLC / 剪辑软件都认，别的平台也不会把反斜杠当转义。
- 导入语义（对齐 m3u8 标准）：
  - `#` 注释与空行跳过；`file:///E:/…` 去掉前缀；`file://server/share/…` 还原成 `\\server\share\…`
  - **相对路径按列表文件所在目录解析**
  - **不检查文件是否还存在**：列表是书签，文件暂时挪走了也不该在导入时被悄悄丢掉
  - 并进现有列表（已有的跳过、保持顺序、文件内的重复项也清掉）
- 绝对路径读回来统一成反斜杠：相对路径拼到目录上会得到 `E:\clips\sub/b.mp4` 这种
  混着两种分隔符的结果，能用，但去重时会和别的写法当成两条。
- 纯逻辑（`to_m3u8` / `parse_m3u8` / `merge_playlist` / `normalize_separators`）都在
  [collections.rs](src-tauri/src/collections.rs) 里单测；rfd 选文件那条只是薄壳。
- 验证：Rust **108** 个（新增 7 条 m3u8 用例）、前端 **236** 个（新增 3 条）、e2e 17 个、
  build、lint 全绿。

## 上一阶段：改键撞车先问一句（不再静默抢键）

- 以前的毛病：把某个动作改到别人已经在用的键上，后端清洗时一个键码只留一条，
  被撞的那条就**静默**没键了；用户只会发现「快进 1 分钟」突然不灵。
- 现在 [ShortcutSettings.tsx](src/components/ShortcutSettings.tsx) 先用
  `buildShortcutMap(shortcuts)` 算出当前生效的键位表，撞车时把那次改键挂起：
  那一行显示「再点一次确认」，下面出一条警告说明这个键现在归谁；再点一次才真的写进去。
  Esc 直接取消，键位不动。
- 后端那层「一个键码只留一条」的清洗保留着——它是最后一道保险，界面这层负责先问。
- 验证：前端 **233** 个（新增两条：撞键要确认、Esc 取消）、e2e 17 个、build、lint 全绿。

## 上一阶段：开屏时长做成设置项（+ 测试不再漏 mpv）

**开屏时长**

- settings 多 `splashSpeed`：`off` / `fast` / `normal`（默认 `normal`）。
  只改**停留时长**，入场与收场那两段动效一个字没动。
- 时序表在 [splash.ts](src/lib/splash.ts)：`off` 0–600ms、`fast` 700–1600ms、`normal` 1150–2600ms。
  `off` 不是「不播开屏」，而是探完就进——收场那 460ms 还是走的，硬切反而像闪了一下。
- 设置页新增「界面」一节，三个档位；改完**下次启动**才生效。
- 认不出来的档位（手改配置文件写错）一律按标准档：后端 `normalized()` 洗一遍，
  前端 `speedFor()` 再兜一次，保证界面上总有一个选项是选中的。

**顺手修掉的测试卫生问题（挺重要）**

- `cargo test` 之前跑完会卡住不返回：有测试自己起的 mpv 没退出，攥着继承过去的
  stdout 句柄，管道永远等不到 EOF（就是 CACHE 里挂了两轮的那个坑）。
- 根因是 `video_settings_reach_mpv` 把 `Child` 塞进 `PlayerState` 之后就不管了，
  而 `Child` 析构**不会**杀进程。
- 修法：给 `PlayerState` 加 `Drop`，兜底调 `clear_process()`。正常退出仍然走 `shutdown()`
  （让 mpv 自己退、把 watch-later 落盘），只有异常路径（用例 panic、提前 return）才强杀。
- 实测：`cargo test` 8.8 秒跑完，跑完 `Get-Process mpv` 数量是 0。

验证：`npm run typecheck`、`npm run lint`（还是那 4 条有意保留的警告）、
`npm run test:run`（**231** 个）、`npm run test:e2e`（**17** 个）、`npm run build`、
`cd src-tauri && cargo test`（**101** 个）全绿。

## 上一阶段：文档债（已完成，不动功能代码）

P4 十条走完之后先清文档，一行功能代码都没改。起因是 README 的「已知限制」还写着
**「定时关闭、快捷键自定义、网络流还在计划中」**——这三样分别是 P4 第 8、9、6 步，
早就做完了，留着会让用户以为没有，属于会误导人的过期说明。

- **README「已知限制」改准**：删掉那一条，换成真实还缺的三项——
  网页视频要外部 `yt-dlp`（没接）、窗口透明度做不到（mpv 子窗口 + `WS_EX_LAYERED`
  不生效，见 P4 第 7 步）、播放列表/收藏夹没有清理入口。
- **版本号不动，仍是 `0.1.1-Alpha`**（用户拍板，这一条是硬规则）：
  **功能没做完就不升版本号**，改版本号 = 宣布一个新版本，不是记账。
  中途一度改成 0.2.0-Alpha，按用户要求已全部回滚（`package.json`、`package-lock.json`、
  `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 五处都回到 0.1.1-Alpha）。
- **不要自己打 release 包、不要自己发 Release**（同样是用户拍板）：
  什么时候打包、什么时候发，等用户说。`tauri build` 只在用户明确要求时才跑。

验证（本轮实跑）：`npm run typecheck` 通过、`npm run lint` 4 条警告 0 error、
`npm run test:run` **223** 个、`npm run build` 成功（`dist/index-*.js` 321 KB / gzip 97 KB）。
Rust 测试照旧重定向到文件跑，别接管道。

## 上一阶段：P4 第 3~10 步（播放控制、文件与窗口、快捷键、方格墙）

一次把 P4 剩下的八步做完。逐条对照，顺带把「单曲循环」那个挂了很久的测试缺口补上了。

**第 3 步 逐帧**

- `ipc.step_frame(forward)` → mpv 的 `frame-step` / `frame-back-step`，命令 `step_frame`；
  快捷键 `.` / `,`（跟 mpv 自己一致）。
- **实测结论（重要）**：`--vo=null` 下验不了「走一帧然后停住」。`frame-step` 要等**视频输出**
  报出「下一帧画出来了」才停，null 输出永远不报，实测走一帧之后 mpv 会继续往下播
  （写死步长的断言会随机红）。所以集成用例只验「两条命令被 mpv 收下」，
  步进的观感必须真机看。

**第 4 步 章节**

- `chapters` / `select_chapter`，面板里列出来，点一下跳过去。
- **两个坑记在这儿**：
  1. 章节文件的 **OGM 写法（`CHAPTER01=00:00:00.000`）在 mpv 0.41 上读不出章节**，
     实测得用 ffmetadata（`;FFMETADATA1` + `[CHAPTER]` + `TIMEBASE`）。
  2. `--chapters-file` 是**文件局部选项**：先启动进程再 `loadfile` 就已经过期了，
     要跟着源一起从启动参数给进去。

**第 5 步 AB 循环**

- `ab_loop` / `set_loop_a` / `set_loop_b`。清除必须写**字面量 `no`**——浮点写不进去
  （和 `aid`/`sid` 同一类坑）。

**第 6 步 拖动打开 + 打开 URL**

- 拖放走 `getCurrentWebview().onDragDropEvent`（`dragDropEnabled` 默认就是开的）；
  拖进来的路径先用 `list_directory` 试一把再分类，不自己猜扩展名。
- 打开 URL 直接复用 `play_video`：mpv 的 `loadfile` 本来就认 http(s)，不用另开链路。
- ⚠️ **拖放这次没在真机上验过**（要窗口真的收到系统拖放才算数），只保证接得上、失败不影响别的功能。

**第 7 步 窗口行为**

- 置顶：`set_always_on_top`（启动时后端按 settings 设一次），界面加 `alwaysOnTop` 落盘。
- 迷你模式：窗口缩到 560×315，界面只剩灵动岛，右上角留一个淡出的「退出迷你模式」；
  `miniMode` 落盘，下次打开还是小窗。缩之前先量原尺寸，退出时还原。
  **坑**：主窗口在 `tauri.conf.json` 里挂着 640×400 的尺寸下限，不先用
  `setSizeConstraints` 把它放开，窗口会被自己的约束卡住——点了「迷你」看起来像没反应。
  所以进迷你前放开下限、退出时放回 640×400，尺寸是 560×315。
- **「透明度」没做，原因写在这儿**：画面是 mpv 的**子窗口**铺满整个客户区，
  分层窗口（`WS_EX_LAYERED`）对子窗口不生效，桌面在 mpv 窗口底下，根本透不过来。
  要做得先换掉嵌窗方式（共享纹理那一路），那是另一个工程，别顺手做。

**第 8 步 定时**

- 15 / 30 / 45 / 60 / 90 分钟 + 到点「暂停」或「退出应用」；只在开着的时候走秒。
- 时间账抽到 [sleep.ts](src/lib/sleep.ts) 单测：最短档也是 15 分钟，界面用例等不起。

**第 9 步 快捷键自定义**

- settings 多了 `shortcuts`（动作 → `KeyboardEvent.code`）。清洗规则：不认识的动作、
  不成形的键码、**撞车的键码**一律丢掉（撞车按动作名字典序留一条），
  不这么做一个键会同时触发两件事。
- 设置页新增「快捷键」一节：点一下按键再按新键，Esc 取消；单条恢复默认 / 全部恢复默认。
- 录制窗口用**捕获阶段**监听：不然新键先被播放器那套全局快捷键吃掉，
  用户看到的是「视频暂停了，键位没改成」。

**第 10 步 杂项**

- 方格墙多了搜索框与名称排序（正序 / 倒序）。排序用
  `localeCompare(..., 'zh-Hans-CN', { numeric: true })`，不然「第10集」会排到「第2集」前面。
- **明确没做的两项**：
  - 开屏时长做成设置项：要动开屏时序，而「开屏动效」是用户明确要求别动的，另开一阶段再说。
  - M3 多主题 token：会改现有外观，同样和「外观不动」的要求冲突。

**顺手补上的缺口**：单曲循环的用例补上了（先真播起来、再切待机，断言同一路径被播第二遍）。
那条旧用例之所以一直红，是因为它**直接把快照切成待机**，从来没有「这一片确实播过」那一步
（`playedCurrent` 从没被记上），于是 `if (playedCurrent.current !== currentFile) return` 一直挡着。
这不是实现的问题，是用例没按真实顺序走。

验证：`npm run typecheck`、`npm run lint`（4 条 `react(set-state-in-effect)` 警告：
两处是播放器外部同步、两处是定时到点，都属于有意保留；lint 仍然退出 0）、
`npm run test:run`（**223** 个）、`npm run test:e2e`（**17** 个）、`npm run build`、
`cd src-tauri && cargo test`（**99** 个）全绿。

e2e 里新加两条，顺手拿真浏览器量了「播放工具」面板的实际布局：
- `test-results/shots/playback-tools.png`：五块内容都在，面板整块留在窗口里；
  截图前要等转场幕布撤掉（520ms），否则拍到的是半透明的一帧，看着像整屏发暗。
- 定时那一排原来会把「关」挤到第二行——把开关摆到时长前面就一行放得下了。

**额外踩的坑**：`cargo test` 接管道会一直不返回——漏下来的 mpv 子进程攥着继承过去的 stdout 句柄，
管道永远等不到 EOF（仓库里那段注释说的就是这件事）。这次是靠杀掉 3 个残留 mpv 才拿到结果。
以后跑 Rust 测试建议重定向到文件，别接管道。
**（已修：根因是 `PlayerState` 析构不杀进程，现在有 `Drop` 兜底，见文件开头那一节。）**

**还没验证到的（只有真机跑起来才算数）**：拖放打开、迷你模式的窗口缩放、逐帧的观感、
定时到点那一刻。

## 下一步

P4 的十条已经走完（除上面写明推迟的两小项），文档债也清完了。

**2026-10-18 起的新规矩（已写进 AGENTS.md）**：不自己启动带界面的程序（`tauri dev` / 打包后的 exe 都不行），
只改代码，测试一律离线跑（单元测试、无头浏览器 e2e、`--vo=null` 的 mpv 集成测试）。
所以原来那份「自己起 `tauri dev` 去量」的清单作废，改成给用户的清单。

1. **请用户自己验一遍**（真机才看得出来，我这边做不了）：
   拖一个文件夹进窗口、拖一个视频文件进窗口、`⋮` 里切迷你模式再退出、`.` / `,` 逐帧、
   设 AB 循环听衔接、定时挑 15 分钟看倒计时在走、设置里改一个键再按新键。
   有问题按现象描述给我，我离线改、离线测。
2. ~~**开屏时长做成设置项**~~ 已完成（见文件开头）。P4 十条到这儿全部收尾。
3. ~~**快捷键冲突提示**~~ 已完成（见文件开头）。
4. ~~**播放列表导出 / 导入 `.m3u8`**~~ 已完成（见文件开头）。
5. ~~**最近播放记录**~~ 已完成（见文件开头）。
6. ~~**列表清空与最近播放单条移除**~~ 已完成（见文件开头）。
7. ~~**窄窗口 / 迷你模式的布局体检**~~ 已完成（见文件开头）。
8. **下一件能离线做的**：**记住窗口大小与位置**。
   settings 加 `windowWidth/windowHeight/windowX/windowY`，退出时存、启动 `setup` 里还原；
   **迷你模式下不存也不还原**（不然会把 560×315 记成「常用尺寸」）。
   归一化给尺寸与坐标一个合理区间；还原前把尺寸夹在 320×180…10000 之间。
   纯逻辑（区间裁剪）单测；真正的还原效果要用户开窗验证。
9. 版本号与发布：**都等用户开口**。功能没做完整之前版本号保持 `0.1.1-Alpha`；
   打 NSIS 包（`npm run tauri build -- --bundles nsis`）和发 Release 都不要自己动手。
10. 如果用户还想要「透明度」，先确认能接受换掉嵌窗方式（见第 7 步的说明），别直接动手。
11. 可选的功能候选（做之前先问用户要哪个）：
   字幕在线搜索（之前明确不做，除非用户改主意）。

## 上一阶段：P4 第 2 步「播放模式」（已完成，一处测试有缺口）

- 设置里多了 `playMode`：**sequence（顺序）/ single（单曲循环）/ list（列表循环）/ shuffle（随机）**，
  默认顺序。选项表由后端给（`play_options`），界面不抄一份。
- 界面上摆在**播放列表面板的顶上**——顺序和随机本来就属于列表，摆在那儿最自然。
- 自动连播的逻辑收在 App 的 `nextAfter(list, current)` 里：单曲循环返回它自己、
  列表循环到头回到第一个、随机从「跟当前不同的」里挑一个，顺序播放到头就停。
  **不用 `loop-file` / `loop-playlist`**：列表在应用这边、不在 mpv 的 playlist 里，
  交给 mpv 反而要两头同步。
- `set_play_mode` 只存设置、不碰 mpv（模式只影响应用自己的判断）。

测试：列表循环（从最后一片回到第一片）、随机（挑到的不是当前那片，且在列表里）、
面板顶上能切模式并存下来。

**缺口**：**单曲循环**只做了实现、没留下用例。写过一个「播完还是它自己」的用例，
但它稳定失败（断言播放次数是 2、实际 1），当时没时间查清是实现的边界还是测试写法的问题，
为了不留一条会闪的用例就先删掉了。**下一轮请先把它补上**：怀疑点在
「`playPath(同一路径)` 之后 `playedCurrent` 的复位时机」。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（197 个）、`npm run test:e2e`（15 个）、`npm run build`、
`cd src-tauri && cargo test`（89 个）全绿。
e2e 一开始挂了 2 条：假后端对未知命令返回 `null`，`playModes` 直接被设成 null 就崩了——
这其实是真 bug（后端没给选项表时该兜住），已修。

**下一步是 P4 第 3 步：逐帧**（`frame-step` / `frame-back-step`，两个快捷键 + README 的快捷键表）。

## 上一阶段：P4 第 1 步「记住上次目录」（已完成）

- 设置里多了 `lastDirectory`（[settings.rs](src-tauri/src/settings.rs)），
  **单独开了一条 `remember_directory` 命令**而不是让界面把整份设置写回来：
  界面手里那份可能是几分钟前读的，整体覆盖会把期间改过的音频/画面设置一起冲掉。
- 启动时在探完运行环境之后读一次设置，把上次的目录直接铺回方格墙——开屏收场时就不是
  一块空画面了。**目录可能已经被删掉或挪走**，所以这一步失败就安静放过，
  不该一开窗先甩一条错误给用户。
- 每次成功打开目录都记一次（`loadDirectory` 里顺手写），记不住也不影响这次浏览。

测试（`src/App.controls.test.tsx`）：启动时把上次的目录铺回来、上次的目录读不到时
退回空状态且**不弹错误**、打开目录之后会记下来。

顺手补了一个测试环境的坑：`revealMainWindow` 会调真实 `invoke`，在 jsdom 里必然抛错，
于是每个用例背后都挂着一条错误条——现在把它也 mock 掉了（那条「不弹错误」的断言才立得住）。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（194 个）、`npm run test:e2e`（15 个）、`npm run build`、
`cd src-tauri && cargo test`（88 个）全绿。

**下一步是 P4 第 2 步：播放模式**（顺序 / 单曲循环 / 列表循环 / 随机），
放在播放列表面板的标题处，自动连播按它决定下一个。

## 上一阶段：README 与开源协议（已更新）

- README 去掉了教程相关的内容，并修掉两处已经过时的说明：侧边栏早就不存在了
  （现在是文件夹条 + 面包屑），截图也已经做完（不再列在「计划中」）。
- 新增 [LICENSE](LICENSE) 与 README 的「开源协议」一节：**项目自身代码 MIT**，
  版权署名 YiZhiCRH380AL；同时写明「安装包里带的 mpv 是以独立进程调用的，按它自己的
  GPL / LGPL 走」——二次分发安装包时要一并遵循。这一条既保护作者也保护二次分发者。
- 反馈邮箱保留。

## 下一步：P4 播放控制与应用层（第 1、2 步已完成，第 3 步起未开工）

> 已经全部做完了：第 3~10 步见文件开头那一节。下面这份清单留着当索引。

按「小而完整、每步都能单独提交」的顺序做：

1. ~~**记住上次目录**~~ 已完成（见上面那一节）。
2. ~~**播放模式**~~ 已完成（见上面那一节；**单曲循环还缺一条用例**，见那里的说明）。
3. **逐帧**：`frame-step` / `frame-back-step`，两个快捷键 + README 的快捷键表。
4. **章节**：`chapter-list` / `chapter`，面板里列出章节并跳过去。
5. **AB 循环**：`ab-loop-a` / `ab-loop-b` / `ab-loop-count`，界面上「设 A / 设 B / 清除」。
6. **拖动打开 + 打开 URL**：Tauri 的 drag-drop 事件 + `loadfile <url>`。
7. **窗口行为**：置顶、迷你模式、透明度（都是 Tauri 的窗口属性）。
8. **定时关闭 / 定时暂停**：应用层的计时器。
9. **快捷键自定义**：现在按键全在 [shortcuts.ts](src/lib/shortcuts.ts) 里写死，改成可配置。
10. 路线图里的小项：方格墙排序与搜索、开屏时长做成设置项、M3 多主题 token。

**进度**：10 步里做完 2 步（第 1、2 步），第 3 步起未开工。

**已经做完、别再重复做的**：

- **记忆播放位置**：P0 的 watch-later 已经在做了（退出时写、下次载入时 mpv 自己跳回去）。
- **播放列表与收藏夹**：按用户当时的要求提前做完了（P4 里的那一条已划掉）。

## 上一阶段：P3 画面（已完成，除了两处推迟）

设置页多了「画面」一节，和音效一样分**简单 / 高级**两种模式
（`videoFilterMode`，和音频那个各自独立）。

- **简单**：画面比例（自动 / 拉伸填满 / 16:9 / 4:3 / 21:9 / 1:1）、填满窗口（裁黑边）、
  旋转（0/90/180/270）、缩放（按倍率步进，界面显示 2^zoom 的真实倍率）、快照
  （按钮 + 格式 + 是否连字幕 + 存到哪儿）。
- **高级**：再加色彩五项（亮度/对比度/饱和度/色相/伽马，滑块拖动只改界面、松手才提交）、
  镜像、去色带 / 补帧 / 跟随显示器 ICC、锐化、画质档位（默认 / 高质量 `--profile=gpu-hq`）、
  **硬解下拉 + `hwdec-current` 显示真正生效的那个**、HDR（色调映射曲线 + 目标亮度 + 高光细节）。

**动手前的那几条结论，实测下来和预想不一样，值得记一下**：

- 交接说明里担心「画面滤镜和音频一样是整体替换的坑」。查了 `--list-options` 才知道
  **画面这一节几乎没有滤镜链**：色彩五项、缩放、画幅、旋转、去色带、锐化、补帧、ICC、HDR
  全是可直接实时写的属性。真正要走 `vf` 的只有**镜像翻转**（mpv 有 `video-rotate`，没有镜像属性）。
  所以 [video.rs](src-tauri/src/video.rs) 的滤镜链只拼 hflip / vflip，其余都是属性写入。
- 只有**硬解**和**画质档位**进启动参数：硬解必须在视频输出初始化之前定下来，
  画质档位会一次性改一批缩放选项；其余每片载入后由 `apply_video_settings` 整套压一遍
  （`video-zoom` / `brightness` / `vf` 都在 watch-later 的记录里，不压就会带回上一部片子的取值）。
- **踩到一个 P1 就踩过的坑**：`video-rotate` 是**整数**属性，写 `90.0` 这种浮点会被 mpv 回
  "invalid parameter"——集成测试里读回来还是 0 才发现。顺带查出 **P2 也埋了一处**：
  `audio-samplerate` 同样是整数，一直用浮点在写（当启动参数时能生效，运行时改就不生效）。
  现在 ipc 层有 `set_integer`，`set_number` 的注释里写明了「只用于浮点属性」。

**推迟的两项**（写在路线图 P3 里但这次没做，理由记下）：

- **裁切 / 自动去黑边**：`cropdetect` 只把检测结果打到日志里，要自动裁得解析它的输出，
  价值和成本不成比例。`--video-crop` 属性本身随时可以接上。
- **360° 视角（`v360`）**：手上没有 360 素材可验，等有真实需求再说。

**测试**：

- `src-tauri/src/video.rs`：比例档位都映射得到数值、界面上每一档都能活过设置白名单、
  镜像拼成滤镜链、只有高质量档进命令行、越界与非法取值折回。
- `src-tauri/src/mpv.rs`：**真实 mpv 集成用例** `video_settings_reach_mpv`——把整套画面设置
  压下去之后逐项读回来（比例、panscan、缩放、旋转、色彩、锐化、去色带、色调映射、目标峰值、
  镜像滤镜），再读一次 `hwdec-current`。
- `src/components/SettingsPage.test.tsx`：简单模式只摆常用项、选比例会通知后端、
  截图会把存到哪儿显示出来、高级模式摊开色彩与硬解并显示**真正生效**的后端。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（191 个）、`npm run test:e2e`（15 个）、`npm run build`、
`cd src-tauri && cargo test`（86 个）全绿。

**还没验证到的**：真机上这套画面项的实际观感（补帧吃多少显卡、HDR 曲线在真实 HDR 片源上的差别、
缩放倍率的步进手感），以及 `--profile=gpu-hq` 在弱显卡上会不会掉帧。

## 上一阶段：从列表播放后「选择目录」的引导没消失（已修复）

**症状**：从收藏夹或播放列表点进去之后，屏幕中间那句「选一个目录，把里面的视频铺成方格」
还挂着不走。

**原因**：列表里点文件名走的是 `handlePlayFromList`，它**只播放、不切目录**。
所以从「还没选过目录」的空状态点一下，视频是播了，但目录区还停在引导页上——
收起画面就是一块空屏。就算本来开着别的目录，方格墙和「上一集/下一集」也跟当前这片对不上
（上下集是按当前目录里的顺序算的）。

**修法**：`handlePlayFromList` 先 `loadDirectory(parentDirectory(path))` 再播。
顺序是先铺墙、再放大播放，两件事都成立。

**测试**：

- `src/App.controls.test.tsx`：新增「从列表里点名字播放时，会先切到它所在的目录」——
  断言 `listDirectory` 被调用、引导语消失、并且确实开始播放。
  （这条用例是先写出来、看着它失败，再去改代码的。）
- `e2e/library.spec.ts`：新增「空状态下从播放列表点名字」——为此给假后端加了
  `playlist` 预置项，这样「没选过目录」和「列表里有东西」才能同时成立；
  断言引导语消失、方格墙出现、灵动岛出现。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（187 个）、`npm run test:e2e`（15 个）、`npm run build` 全绿。

## 上一阶段：方向键快进退无效、连播跳过一个（已修复）

**1. 方向键快进/快退无效**

根因在 `shouldIgnoreShortcut` 的一条老规矩：**`input[type=range]` 自己吃掉方向键**。
播放进度条正好是 range，而它的 `step` 是 **0.1 秒**——用户点过一次进度条之后焦点就留在上面，
之后按方向键只挪 0.1 秒，肉眼完全看不出来，表现就是「无效」。

修法：给进度条加 `data-keys="playback"`，`shouldIgnoreShortcut` 遇到带这个标记的 range
**不拦方向键**，交回给播放器（5 秒一跳）。其余滑块（音量、均衡器）照旧自己吃方向键，
在设置页调均衡器时按方向键不会变成快进。

**2. 播完自动下一个会「跳过一个」**

判据是 `idleActive`（片子播完 mpv 会卸掉文件进入待机），但**换片的一瞬间 mpv 也是待机**：
`loadfile` 之后新片还没被拉起来，这时的快照同样报「待机」。于是刚切到第二片就被当成
「第二片也播完了」，直接又跳一格——第二片被跳过，直接播第三片。

修法：多一条「**这一片确实播起来过**」（`playedCurrent` 记住上一部真的播过的片子，
只有它等于当前文件时，待机才算「播完」）。新片刚载入的那些假待机天然对不上，
也不会再连跳；原来的 `advancedFrom` 就不需要了，直接删掉。

**测试**：

- `src/lib/shortcuts.test.ts`：带 `data-keys="playback"` 的 range 不拦方向键；
  普通 range 仍然拦。
- `src/App.controls.test.tsx`：把原来那条「焦点在进度条上时方向键交给控件」的用例
  反过来（现在应当快退快进 5 秒）；连播的两条用例改成「先播着、再切成待机」的真实顺序，
  并新增回归用例「刚切到下一片时那个假待机不会再往下跳一格」。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（186 个）、`npm run test:e2e`（14 个）、`npm run build` 全绿。

## 上一阶段：跳转后画面还在播、方格被图片撑成柱子（已修复）

用户截图里两件事一起发生，是两个独立的原因。

**1. 方格被拉成一屏高的柱子**

上一阶段为了不让方格被压扁，给 `.grid` 加了 `grid-auto-rows: max-content`。
行高改成「由内容决定」之后，`.tile__image` 的 `height: 100%` 在**内容尺寸计算**里解析不出百分比，
浏览器就退回用它自己的原生高度（真机上抽出来的帧是 1080 高）——整行被撑到 ~1150px，
于是变成一排高瘦的柱子。

**修法**：把封面图 `position: absolute; inset: 0`，让它完全不参与父容器的高度计算，
行高只由封面区的 `aspect-ratio` 决定。

**为什么没被测试挡住**：e2e 里的假缩略图是 1×1 的 GIF，原生高度 1px，正好绕过了这个坑。
现在换成了 **1920×1080 的 SVG 占位图**（尺寸像真的），并新增断言
`tile.slack < 60`（卡片比封面高出来的部分只应该是一个名字的量）——
撑成柱子时这里会是几百上千，跑一次就会红。

**2. 从收藏夹跳转后视频还在播**

上一阶段为了绕开「暂停又恢复」，跳转时故意不去停画面，只换了目录、加了高亮。
但那样方格墙还停在放大状态，高亮根本看不见。现在按用户的要求改成：
**跳转 = 带我去看看这个文件在哪，不是播它** —— 先离开播放画面，再换目录、加高亮。

为此给后端加了 `pause_video`（把 pause 设成 true），而不是继续用 `toggle_pause`：
跳转和换目录都可能要求「先离开播放画面」，两次 `toggle` 会变成「暂停又恢复」，
而「设成暂停」连着调多少次结果都一样。收起画面（灵动岛那个 ⌄）也一并改用它。

**测试**：

- `e2e/library.spec.ts`：假缩略图换成 1920×1080；新增 `slack` 断言（放大播放时、
  以及 40 个视频要滚动时都验）。
- `src/App.controls.test.tsx`：新增「正在播放时从收藏夹跳转：先离开播放画面，
  而且不会顺手播起来」（断言收起了画面、调了 `pauseVideo`、除最开始点方格那次之外没有别的播放、
  那一格被高亮）；「收起画面」的断言从 `togglePause` 改成 `pauseVideo`；
  「点击展开的画面切换播放暂停」仍然用 `togglePause`（那是真切换）。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（184 个）、`npm run test:e2e`（14 个）、`npm run build`、
`cd src-tauri && cargo test`（79 个）全绿。

## 上一阶段：方格被压扁、措辞、列表缺封面（已修复）

**1. 从收藏夹跳转时「方格变成长条」**

根因不在跳转：**只要在播放（画面展开），下面那些方格就已经被压扁了**。
`.grid[data-expanded='true']` 原本会换成 flex 列，而 flex 列里每一项都被拉成全宽，
又因为容器有确定高度而被 `flex-shrink` 压到只剩边框那 2px。跳转时的 `scrollIntoView`
把这排「长条」滚进了视野，看起来像是跳转弄坏的。

实测（真 Chromium，5 个视频）：展开前每格 **164px**；展开后画面那格 674px、**其余各 2px**。

修法三步：

- `.grid[data-expanded='true']` **不再换 flex，保持网格**，只让画面那一格
  `grid-column: 1 / -1` 独占第一行（`grid-template-rows: 100%`），其余的照旧排在下面、
  被 `overflow` 裁掉。
- `.grid` 加 `grid-auto-rows: max-content`：**行高只由卡片决定**。网格容器有确定高度时
  `auto` 行会被压扁——和之前文件夹条那个坑是同一个，这次连「视频多到要滚动」的情形一起验了。
- 展开时**不做 `scrollIntoView`**：这时方格墙是被裁掉的状态，滚它只会把画面本身顶上去。

**2. 「响度归一化」的说明用词**

`夜里看片不用一直捏着音量` → `晚上看视频不用一直调音量`（设置页文案和 settings.rs 的注释一起改）。

**3. 播放列表 / 收藏夹要显示封面和完整文件名**

- 每一行前面加了 16:9 的封面缩略图（64px 宽），名字改成折行、不再用省略号截断，
  面板也加宽到 352px（`.popover--paths`）。
- 为此把缩略图缓存抽成 [thumbnail-cache.ts](src/lib/thumbnail-cache.ts)：方格墙和这两个面板
  共用一份，同一个路径的抓取还会**去重**（抓帧是串行的，各抓各的等于把等待翻倍）。
  面板渲染时先看自己的 state、再看共用缓存——网格已经抓过的帧直接就能画出来
  （这一条漏了会表现为「面板里没有封面」，就是因为网格先抓过、面板以为不必再抓）。

**测试**：

- `e2e/library.spec.ts`：新增「放大播放时下面那些方格不会被压扁」（断言封面仍是 16:9、
  高度正常，而不是 2px）、「视频多到要滚动时每一格还是原来的高度」，并把收藏夹跳转那条
  从诊断脚本改成断言（跳转前后每格尺寸一致 + 那一格被高亮）；列表行断言有封面、
  且 `white-space` 是 `normal`（不再截断）。
- `src/App.controls.test.tsx`：列表每一行带封面；缩略图缓存是模块级的，用例之间要清，
  否则后一个用例会拿到前一个抓到的帧、不再去问后端。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（183 个）、`npm run test:e2e`（14 个）、`npm run build`、
`cd src-tauri && cargo test`（79 个）全绿。

## 上一阶段：教程打光指错按钮（已修复）

**症状**：教程讲到「右上角是设置」那一步时，框住的是**播放列表**按钮，不是齿轮。

**原因**：那一步的目标选择器是 `.app__tool`，而顶栏上**三颗按钮共用这个类**
（播放列表 `≡`、收藏夹 `★`、设置 `⚙`），`document.querySelector` 取到的是按 DOM 顺序
排在最前面的那颗——也就是播放列表。

**修法**：教程的目标改成显式的 **`data-tutorial` 钩子**，不再拿样式类当定位依据。
钩子只出现在要指的那一个元素上，从根上排除「打到别人身上」：

| 步骤 | 钩子 | 挂在哪 |
| --- | --- | --- |
| 看示例 | `data-tutorial="sample"` | 空状态里的「看示例视频」 |
| 点一格 | `data-tutorial="tile"` | 方格的 `.tile` 容器 |
| 灵动岛 | `data-tutorial="island"` | `.island` |
| 音轨与字幕 | `data-tutorial="media"` | `.island__media` |
| 右上角是设置 | `data-tutorial="settings"` | 顶栏的齿轮 |

**为什么值得这么改**：这个 bug 的本质是「拿共用的样式类当定位钩子」。
以后再往顶栏加按钮、或者给某颗按钮换类名，教程都不会再莫名指错。

**测试**：

- `src/App.controls.test.tsx`：钉住「`.app__tool` 有三颗」这件事（说明它不能当唯一目标），
  并断言 `[data-tutorial='settings']` 就是那颗「设置」按钮。
- `e2e/smoke.spec.ts`：走到这一步时量**打光框与齿轮的实际位置**——整个齿轮要在框里，
  而且框的左边必须在播放列表按钮右边（也就是「没框到它」）。顺手截图
  `test-results/shots/tutorial-settings.png` 供人眼复核。

验证：`npm run typecheck`、`npm run lint`（仍是那 2 条有意保留的警告）、
`npm run test:run`（182 个）、`npm run test:e2e`（11 个）、`npm run build` 全绿。

## 上一阶段：播放列表、收藏夹与两个 bug 修复（已完成）

### 播放列表

- **加进列表**：鼠标移到方格上，右上角浮出两颗动作按钮（`≡` 加列表、`☆` 收藏），再点一次移出。
  为此把方格从一颗 `<button>` 改成了「容器 + 打开按钮 + 动作按钮」——按钮不能嵌按钮，
  所以 `.tile` 现在是普通容器，`.tile__open` 才是铺满整卡的那颗按钮（[VideoGrid.tsx](src/components/VideoGrid.tsx)）。
- **面板**：标题栏右上角新增 `≡` 入口，复用 [Popover.tsx](src/components/Popover.tsx)，
  这次给它加了 `.popover--down`（顶栏的浮层挂在按钮**下面**，不像灵动岛那样往上弹）。
  面板内容 [CollectionsPanel.tsx](src/components/CollectionsPanel.tsx)：↑ ↓ 调顺序、✕ 移出、点文件名直接播。
- **看完自动播下一个**：判据是 mpv 的 **`idle-active`**。这里有一条实测结论值得记下来——
  `--idle=yes` 下片子播完 mpv 会把文件**卸掉**，`eof-reached` 直接变成**不可用**，
  只有 `idle-active` 会从 false 翻成 true（探针结果：pos/dur 一起消失、idle=true）。
  所以 `PlayerSnapshot` 多了 `idleActive`，界面在轮询里看到它翻真就接上列表里的下一个；
  同一个文件只推进一次（用 ref 记着），否则待机会在每次轮询里反复出现、一直往下跳。
- **顺带修掉一个老问题**：进入待机之后 `duration` / `time-pos` 读不出来，
  界面会从片尾跳回 `0:00`。现在 [mpv.rs](src-tauri/src/mpv.rs) 在播放时记下时长，
  待机时报「停在片尾」（`PlayerState::last_duration`，换片时清掉）。

### 收藏夹

- 同样在方格上悬停加收藏（`☆` / `★`）。
- 面板里点文件名是**播放**，点下面那行**小字**是**跳回它所在的目录**并把那一格高亮两下
  （`data-highlight` + CSS 动画 + `scrollIntoView`）。两件事分开，用户才找得回原处。
- 目录是从路径推出来的（[path.ts](src/lib/path.ts) 的 `parentDirectory`，复用 `pathSegments` 的规则，
  盘符根目录、混用分隔符这些边界不用再写一遍）。

### 两个 bug

1. **品牌名与版本号**：左上角改成 `FutureVideo`，右下角挂版本小字。
   版本号只在 `vite.config.ts` 里从 `package.json` 注入一次（`__APP_VERSION__`），
   界面上不手写——不然迟早和实际发出去的版本对不上。开屏的字标、窗口标题、`index.html` 的
   `<title>` 一并改成 `FutureVideo`。
2. **教程第二步点方格不前进**：两个原因叠在一起，都堵掉了。
   - 判据错了：第二步原本等 `hasMedia`（= 真播起来了），而首次播放要起 mpv 进程、找窗口、
     连管道，一两秒内什么反馈都没有，用户只会去按「跳过这步」。
     现在新增 `openedVideo`——**点下去就算走过**，不等画面挂上来。
   - 底衬会吞掉点击：找不到打光目标时退回居中的卡片，那层 `.tutorial__backdrop` 是
     `pointer-events: auto` 的，整页点击都被它吃了。现在等操作的那一屏给它标
     `data-pass-through`，只负责压暗、不吃点击。

### 存储

播放列表与收藏夹存成配置目录下的 **`collections.json`**（[collections.rs](src-tauri/src/collections.rs)），
**不和 `settings.json` 混在一起**：设置是偶尔改一次，列表是点一下就写一次。
归一化时会去掉空路径与重复项——同一个视频在列表里出现两遍，自动连播会原地打转。

### 覆盖到的测试

- `src-tauri/src/collections.rs`：空/坏文件的兜底、去重、开关、挪格到边界不动、往返。
- `src-tauri/src/mpv.rs`：快照多了 `idleActive` 字段（camelCase 那条用例里也钉住了）。
- `src/lib/path.test.ts`：`parentDirectory`（普通路径、盘符根目录、混用分隔符、只有文件名）。
- `src/App.controls.test.tsx`：方格上的两颗按钮、加/移出后按钮状态跟着后端返回值变、
  面板里调顺序与移出、收藏夹点小字会跳到目录并高亮那一格、
  **播完自动播下一个**以及「没有下一个就停在原地」。
- `e2e/library.spec.ts`：在真浏览器里断言**不悬停时动作按钮是透明的、悬停后 opacity 变 1**，
  加进列表后从右上角打开面板能看到它，并截图 `test-results/shots/playlist.png`。

验证：`npm run typecheck`、`npm run lint`（2 条 `react(set-state-in-effect)` 警告，
分别在教程「做到之后自动翻页」和这里的「播完自动下一个」，都属于「和外部系统同步」，
有意保留）、`npm run test:run`（181 个）、`npm run test:e2e`（11 个）、`npm run build`、
`cd src-tauri && cargo test`（79 个）全绿。

**还没验证到的**：真机上从列表自动连播的观感（换片那一下的衔接）、
收藏夹高亮在长列表里滚动定位的效果。

**下一步**：仍然是文末路线图里的 **P3 画面**（缩放画幅、色彩、几何、画质档位、硬解、HDR、快照），
交接说明见文件开头。版本号三处（`package.json` / `tauri.conf.json` / `Cargo.toml`）
保持 `0.1.1-Alpha`——用户定过规矩：功能没做完整就不升号，发版也等用户开口。

## 上一阶段：修目录区被压扁、换封面图标、内置示例视频（已完成）

三件事凑在一起，都是「真机上看才发现」的那一类。顺手补上了**在真浏览器里量布局**的手段，
这是这次最有用的收获。

**1. 文件夹条的卡片被压扁（就是「高度不完全」）**

`.folders` 原来是「折行 + `max-height: 186px`」，而网格的 `auto` 行会被容器的高度上限压：
8 个卡片正好被压成 78px 一行，卡片自己又是 `overflow: hidden`，封面直接被裁掉一截。
改成**单行横向滚动**（`grid-auto-flow: column` + `grid-auto-columns: 168px`），行高只由内容决定，
不可能再被压。`.drives` 顺手加了 `grid-auto-rows: max-content`，同一个坑不要再踩第二次。

封面同时从 `aspect-ratio: 16/9` 改成固定 92px 高：卡片高度可预测，行高也就有保证了。
另外入场动画是从下往上浮 6px 的，而容器底部原来只留 4px 余量——**动画期间卡片底边会被裁一刀**，
所以底边 padding 加到了 10px，测试里也钉住了「底边至少留 6px」。

**2. 封面换成两色文件夹图标（没有用生成的位图）**

两个 `<path>`：后面那片（标签 + 顶边）42% 透明度，前面那片实色。文件夹和磁盘共用它。
**没有采用「生成一张图片」的做法**：这个项目的图标一直是内联 SVG（描边 + `currentColor`），
塞一张 PNG 进去，缩放会糊、也没法跟着主题变色。`.folder__glyph` 现在按 `<path>` 上的 class
区分笔法：`glyph__stroke` 走描边（箭头、显示器那种），`glyph__back` / `glyph__front` 走填充。

**3. 内置示例视频，教程带着用户真上手**

- 示例文件在 [src-tauri/resources/sample/](src-tauri/resources/sample/)：`示例视频.mp4`（187 KB，
  12 秒，640×360，h264 + aac 音轨；用 mpv 的 `--o` 配 `--lavfi-complex` 现场生成的，
  视频源是 lavfi 的 `gradients`，音轨是一路压到 0.15 的 330 Hz 正弦）和同名的 `示例视频.srt`
  （三屏说明，正好演示「同名字幕自动加载」）。
  `.gitignore` 里给这个目录开了 `*.mp4` 的白名单，`tauri.conf.json` 的 `bundle.resources` 也加上了。
- [sample.rs](src-tauri/src/sample.rs) 的 `prepare_sample_folder` 把这两个文件复制到应用配置目录下的
  `示例视频/`，**已经存在就不覆盖**——用户改过的字幕、拖过的进度不能被一次点击抹掉。
  安装目录里的资源是只读的，而「打开目录」需要一个真目录。
- 空状态多了**「看示例视频」**（用强调色），教程的第一步改成指向它：用户真点一下就把示例目录打开了，
  不用先纠结「选哪个文件夹」。后面几屏依次是点方格播放、灵动岛、音轨与字幕、设置、快捷键。

覆盖到的测试：

- [e2e/library.spec.ts](e2e/library.spec.ts)（新文件）：用 `__TAURI_INTERNALS__.invoke` 的假后端，
  在**真 Chromium** 里搭出目录与磁盘两种界面，断言卡片没被裁、同一行高度一致、封面 92px、
  底边留够 6px；顺便截图到 `test-results/shots/`（该目录在 `.gitignore` 里）供人眼复核。
  另有一条**教程真操作**的用例：真点「看示例视频」→ 方格出现 → 真点一格 → 自动进第三步。
  **为什么值得单独说**：目录浏览和此电脑在浏览器里本来走不到（按钮是灰的），
  有了这个假后端才第一次能量它们的真实布局——这次的 bug 就是这么量出来的。
- `src-tauri/src/sample.rs`：复制逻辑（首次全拷、已存在不覆盖、漏资源要报错），外加一条集成用例——
  随包的那个 mp4 **真能被 mpv 打开**，而且有视频轨、有音轨、同名字幕自动加载上了。
- `Tutorial.test.tsx` / `App.controls.test.tsx` / `backend.test.ts`：第一步的新目标、
  空状态点「看示例视频」会先 `prepare_sample_folder` 再当普通目录打开、浏览器里的兜底。

验证：`npm run typecheck`、`npm run lint`（仍是 1 条 `react(set-state-in-effect)` 警告，
在教程「做到之后自动翻页」那个 effect 上，属于有意为之）、`npm run test:run`（167 个）、
`npm run test:e2e`（10 个）、`npm run build`、`cd src-tauri && cargo test`（72 个）全绿。

**还没验证到的**：示例视频在真机上播出来的观感（画面是渐变动画、音轨是轻声正弦波）、
以及 `tauri dev` / 打包之后 `bundle.resources` 是否真的把示例文件带到位——
这一步只有真机跑一次才算数。

## 下一步：P3 画面（交接说明）

> 写给接手的人：这一节是「接下来做什么、怎么做、哪里会踩坑」。已经做完的部分在下面的「上一阶段」里，
> 每节末尾都有验证命令。动手前先读仓库根目录的 `AGENTS.md`（先在 GitHub 找可参考的仓库、每步都要有测试、
> 每步都要提交并推送、改完回来更新本文件）。

### 起点在哪

- **播放内核**：mpv 常驻进程 + 命名管道 JSON IPC，`--wid` 嵌入主窗口，换片走 `loadfile`。
  见 [mpv.rs](src-tauri/src/mpv.rs)、[mpv/ipc.rs](src-tauri/src/mpv/ipc.rs)。
- **设置怎么写**：[settings.rs](src-tauri/src/settings.rs) 存 `settings.json`，
  [audio.rs](src-tauri/src/audio.rs) 负责把设置拼成 mpv 参数和滤镜链。P3 照这个结构新开一个
  `video.rs`，别都堆进 mpv.rs。
- **界面**：[SettingsPage.tsx](src/components/SettingsPage.tsx) 是右上角齿轮打开的设置浮层，
  音效那一节已经有「简单 / 高级」两种模式。P3 的「画面」应该是它的第二节，模式那套直接照抄。
- **详情通道**：`player_details` 返回各项当前值；界面每次改动都是「发命令 → 重读真实状态」，
  不在前端推演结果。新增画面项时沿用。

### P3 的目标

| 功能 | mpv 侧 |
| --- | --- |
| 缩放与画幅 | `video-zoom`、`panscan`、`video-aspect-override`、`video-align-x/y` |
| 色彩 | `brightness`、`contrast`、`saturation`、`hue`、`gamma` |
| 几何 | `video-rotate`、`hflip` / `vflip`、`crop`、`cropdetect` |
| 画质档位 | `deband`、`sharpen`、`interpolation`、`tscale`、`icc-profile-auto` |
| 硬解 | `hwdec` 下拉 + 用 `hwdec-current` 显示**实际生效**的后端 |
| HDR | `tone-mapping`、`target-peak`、`hdr-contrast-recovery` |
| 快照 | `screenshot` 命令（jpg/png/webp/jxl/avif，可带或不带字幕） |
| 可选 | `v360` 做 360° 视角（VR 头显不支持） |

### 动手前要知道的四件事

1. **画面滤镜是同一个坑**。`vf` 和 `af` 一样是整体替换的语义，而且 P2 实测过
   `af-command` 对 `lavfi=[...]` 桥接的滤镜不可用（`vf-command` 大概率也一样）。
   所以裁切、旋转、降噪这些走 `vf` 链的东西，同样要「一个组装点 + 松手才提交」，
   别做实时拖拽。色彩那几个（`brightness` 之类）是 mpv 自己的属性，可以直接实时写。
2. **切硬解会重建视频输出**，画面会闪一下；有些后端在本机根本不可用
   （本机是 4090 + AMD 核显，`qsv` 没有 Intel 核显可依附）。界面上要显示 `hwdec-current`
   报出来的**真正生效**的那个，别把 `--hwdec=help` 里那一百多个名字铺出来。
3. **watch-later 会记画面状态**：`video-zoom`、`brightness`、`vf` 都在它的默认记录列表里。
   和 P2 的处理一样：做成「全局偏好」的项要在 `play_video` 载入文件之后重新压一遍，
   否则换到一部以前调过画面的片子会被它带走。
4. **快照要落在用户找得到的地方**。`screenshot` 默认写当前工作目录，要用 `--screenshot-dir`
   指到「视频同目录」之类的位置，并在界面上告诉用户存到哪了。

### 参考实现

沿用 P2 的路子：在 GitHub 上找 mpv 的画面配置合集、以及 mpv.net / IINA 的画面设置页，
看它们暴露了哪几项、怎么分组。抄结构可以，但别把它们的设置树整个搬过来——
这个应用的设计语言是「少而准」。

### 测试怎么写

- 纯函数单测：设置 → 启动参数 / `vf` 链的拼接（照 [audio.rs](src-tauri/src/audio.rs) 的测试写），
  放在新的 `video.rs` 里。
- 真实 mpv 集成测试：复用 `mpv.rs` 的 `spawn_headless`——挂上 `vf` 之后读 `vf` 属性断言链上有它，
  色彩类写完读回来断言。跑在 `--vo=null` 下不会开窗。
- 界面测试照 [SettingsPage.test.tsx](src/components/SettingsPage.test.tsx)：mock 后端、
  断言每个控件发出的命令，以及「拖动不发请求、松手才提交」。

### 交付标准

和 P0/P1/P2 一样：`npm run typecheck`、`npm run lint`、`npm run test:run`、`npm run test:e2e`、
`npm run build`、`cd src-tauri && cargo test` 全绿；按功能拆成几个 commit 推到 GitHub；
最后把「做完了什么 + 下一个阶段」更新回本文件。

## 上一阶段：P2 音频进阶（已完成，以下是当时的交接说明）

> 写给接手的人：这一节是「接下来做什么、怎么做、哪里会踩坑」。已经做完的部分在下面的「上一阶段」里，
> 每节末尾都有验证命令。动手前先读仓库根目录的 `AGENTS.md`（先在 GitHub 找可参考的仓库、每步都要有测试、
> 每步都要提交并推送、改完回来更新本文件）。

### 起点在哪

- **播放内核**：mpv **常驻进程** + Windows 命名管道上的 JSON IPC，用 `--wid` 把画面嵌进主窗口。
  入口是 [mpv.rs](src-tauri/src/mpv.rs)，管道读写是 [mpv/ipc.rs](src-tauri/src/mpv/ipc.rs)。
  进程只启动一次，换片走 `loadfile`；退出前发 `quit`，好让 watch-later 落盘。
- **全局偏好**：[settings.rs](src-tauri/src/settings.rs)，落在应用配置目录的 `settings.json`。
- **界面**：React 覆盖在 mpv 画面之上。控制条（灵动岛）是 [Island.tsx](src/components/Island.tsx)，
  浮层统一走 [Popover.tsx](src/components/Popover.tsx)（倍速菜单 `role=menu`，音轨与字幕面板 `role=dialog`），
  面板内容在 [MediaPanel.tsx](src/components/MediaPanel.tsx)。
- **详情通道**：`player_details` 返回轨道表与各项当前值；面板每次改动都是「发命令 → 重读真实状态」，
  不在前端自己推演结果。新增功能请沿用这个模式。

### P2 的目标

给音频加一层「滤镜链」能力，对标 PotPlayer 的音效页：

| 功能 | mpv 侧 |
| --- | --- |
| 均衡器 | `af` + `lavfi=[superequalizer=1b=3:2b=0:...]`（18 段） |
| 响度归一化 | 静态：`--replaygain` / `--replaygain-preamp`（靠文件里的标签）；动态：`lavfi=[dynaudnorm]` 或 `lavfi=[loudnorm]` |
| 变速不变调 | `audio-pitch-correction`（默认已开）+ `scaletempo2` |
| 立体声扩展 / 环绕上混 | `lavfi=[extrastereo]`、`lavfi=[surround]`、`lavfi=[stereotools]` |
| 声道重映射 | `audio-channel-map`，或 `lavfi=[pan]` / `lavfi=[channelmap]` |
| 透传 | `--audio-spdif=ac3,dts,eac3,truehd,dts-hd` |
| 采样率 / 位深 | `--audio-samplerate`、`--audio-format` |

已经在本机核实过：`af`、`af-command`、`change-list` 三条命令存在（`mpv --input-cmdlist`），
`superequalizer` / `equalizer` / `loudnorm` / `dynaudnorm` / `scaletempo2` / `rubberband` /
`surround` / `channelmap` / `pan` / `stereotools` / `extrastereo` 这些滤镜存在（`mpv --af=help`）。

### 动手前要先想清楚的四件事

1. **滤镜链只能有一个组装点**。正确做法是「读设置 → 拼成一条有序的滤镜列表 → `af set`」，
   或者 `change-list af clr` 之后逐条 `append`。不要让每个开关各改一次 `af`——两个功能一叠加
   就会互相覆盖。顺序也有讲究（增益类应该排在动态压缩之前），把顺序的理由写进注释里。
2. **实时调参是难点**。`af-command` 只对实现了命令接口的滤镜有效，`lavfi=[...]` 桥接过来的
   ffmpeg 滤镜**大概率不支持**（这一条**没实测**，动手第一件事就是验证）。
   不支持就只能重建滤镜链，代价是**一次立刻能听出来的瞬断**：所以如果做滑块，
   必须节流——拖动过程中只更新界面，松手才提交。
3. **透传和滤镜互斥**。开了 `audio-spdif` 之后音频不再经过滤镜链，均衡器、响度归一化全部失效。
   界面上要互斥提示，否则用户会以为「开了没反应」是 BUG。
4. **每片还是全局要想清楚**。`watch-later-options` 的默认列表里包含 `af`，也就是说滤镜链天然
   会「跟着片子走」。但均衡器其实是耳机/音箱的事，不是某一部片子的事，做成全局偏好更符合直觉。
   如果按全局做，就要在 `play_video` 载入文件之后重新应用一遍全局设置，别被 watch-later 的旧值盖住。

### 需要用户拍板的（开工前先问，别自己定）

**界面形态**：只给几个开关（响度归一化、虚拟环绕、变速不变调），还是「预设 + 高级展开」
（音乐 / 电影 / 夜间模式，展开后是 18 段滑块）？后者工作量大得多，而且直接决定上面第 2 点的复杂度。
用户还没回答这个问题。

### 可以参考的开源实现（AGENTS.md 要求先找现成的）

GitHub 上有现成的 mpv 均衡器脚本，滤镜怎么挂、预设怎么组织可以直接看，不必从零设计：

- `akFace/equalizer-gui`：mpv 的 10 段均衡器 GUI 脚本，带自动保存与持久化。
- `mrffr/mpv-headphone-eq`：按耳机型号切换 EQ 的脚本。
- `mfcc64/mpv-scripts`：mpv 脚本合集（星标最多的那一批）。

它们是跑在 mpv 内部的 Lua 脚本，和我们的「外部进程 + IPC」架构不同，但**滤镜链的拼法与预设的组织方式可以直接借鉴**。

### 测试怎么写

沿用现有两种套路：

- **纯函数单测**：预设 → band 参数的映射、滤镜链的拼接顺序、设置项规范化。放在 Rust 侧
  （照 `parse_tracks` / `clamp_range` 的样子）或前端 `src/lib/` 里。
- **真实 mpv 的集成测试**：`mpv.rs` 的测试模块里已经有 `spawn_headless` 辅助函数可以复用——
  挂上滤镜后读 `af` 属性，断言链上确实出现了那个滤镜；读 `audio-format` / `audio-samplerate`
  断言设置生效。这类测试跑在 `--ao=null` 下**不会出声**；
  **不要**在测试里改音频输出设备，那会在真机上真的切走声音。

### 交付标准

和 P0、P1 一样：`npm run typecheck`、`npm run lint`、`npm run test:run`、`npm run test:e2e`、
`npm run build`、`cd src-tauri && cargo test` 全绿；按功能拆成几个 commit 推到 GitHub；
最后把「做完了什么 + 下一个阶段」更新回本文件。

## 上一阶段：P2 音频进阶与设置页（已完成）

给音频加了一层滤镜链，并为此做了一个独立的设置页。

**先说一条实测结论，它决定了整套实现方式**：`af-command` 对 `lavfi=[...]` 桥接过来的滤镜
**不支持**——裸参数回 `invalid parameter`，带 `av-command` 回 `error running command`。
也就是说调任何一个参数都要**重建整条滤镜链**，所以界面上所有滑块都是「拖动只改界面、
松手才提交」。（用真机 IPC 探针验证的，命令和返回都记在上面 P2 那段交接说明里。）

**均衡器没用 `superequalizer`**：它号称 18 段，但各段的中心频率没有公开，滑块根本标不出
「这一段调的是多少 Hz」，用户只能盲调、预设也无从谈起。改成串联 ffmpeg 的 `equalizer`
（峰值滤波器）之后频点自己定，于是有了标准的 10 段图形均衡器：31 / 62 / 125 / 250 / 500 /
1k / 2k / 4k / 8k / 16k，每段都能标频点，预设（音乐 / 电影 / 夜间 / 人声 / 低音增强）才有意义。

- **滤镜链只有一个组装点**：[audio.rs](src-tauri/src/audio.rs) 的 `build_filter_chain`。
  顺序是「均衡 → 响度归一化 → 立体声扩展 → 环绕」，理由写在代码注释里。
  零增益的频段会被跳过（少一次运算，回读的链也干净）；**透传开着时整条链是空的**——
  mpv 的透传不经过滤镜，挂着只会让人以为开关坏了。
- **两种模式**（就是这次确认的做法）：简单模式三个开关（响度归一化 `dynaudnorm`、
  虚拟环绕 `surround`、立体声扩展 `extrastereo`）；高级模式给预设 + 10 段滑块 +
  输出采样率 / 位深 + 透传。
- **设置页**：整窗浮层（[SettingsPage.tsx](src/components/SettingsPage.tsx)），
  入口是标题栏**右上角的齿轮**。选项表（频点、预设、位深、采样率）由后端
  `audio_options` 给，标签只有一份来源，前端不抄。
- **新增的设置项**（都在 `settings.json` 里）：`audioFilterMode`、`loudnessNormalization`、
  `virtualSurround`、`stereoWidening`、`equalizerPreset`、`equalizerBands`（10 个 dB 值，
  越界折回 ±12、长度补齐）、`audioSamplerate`、`audioFormat`、`audioSpdif`。
  沿用 P0 的约定：默认值等于 mpv 默认行为的项写成 `Option`，`None` 就完全不传。

覆盖到的测试：

- `src-tauri/src/audio.rs`：每个预设的段数与幅度上限、低音预设只动低频、平坦曲线不产生滤镜、
  频点出现在滤镜串里、链的顺序、透传清空整条链、界面选项 id 都能活过设置的白名单。
- `src-tauri/src/settings.rs`：新项的类型、越界与长度归一化、采样率 0 等价于跟随源。
- `src-tauri/src/mpv.rs`：启动参数带上采样率/位深/透传；**真实 mpv 的集成用例**——
  把链挂上去之后回读 `af` 属性，断言标签和顺序是 `eq00 / norm / wide`，清空之后链上什么都没有。
- `src/components/SettingsPage.test.tsx`：两种模式各自的控件、预设置信、开关透传后滤镜禁用并给出说明、
  拖滑块过程中不发请求（松手才提交）、采样率与位深的切换。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（161 个）、
`npm run test:e2e`（7 个）、`npm run build`、`cd src-tauri && cargo test`（68 个）全绿。

## 上一阶段：交互教程与目录外观（已完成）

两件事：教程从「图文说明」改成能真动手，文件夹和磁盘改成和方格同一套卡片。

- **交互教程**（[Tutorial.tsx](src/components/Tutorial.tsx)）：要讲的按钮直接从页面上量位置，
  打光框四周铺阴影、中间留一个洞。整层浮层**不吃点击事件**（只有提示卡片吃），
  所以被指到的那颗按钮能真的按下去；做完那件事（目录选好、视频放起来）就自动翻页。
  六屏的顺序是：选目录 → 点方格播放 → 灵动岛 → 音轨与字幕 → 右上角设置 → 快捷键。
  - 等操作的步骤主按钮是灰的，永远配一个「跳过这步」；找不到目标元素时退回居中的卡片。
    教程不该把人困住。
  - 从标题栏的「?」重新打开时，「打开时就已满足」的步骤不再拦人，直接可以点下一步。
  - 为此 `Tutorial` 多了一个 `progress` 属性（App 传「有没有目录 / 有没有视频 / 有没有在播」），
    界面空闲隐藏的条件也加上了 `!tutorialOpen`——否则它正指着的那颗按钮会自己隐去。
- **目录外观**（[FolderStrip.tsx](src/components/FolderStrip.tsx) + `App.css`）：文件夹和磁盘
  改成和方格一样的卡片——上面 16:9 的封面区（放一个大图标），名字在下面，同样的圆角、描边、
  悬停抬起。子目录特别多时文件夹那一行自己滚，不会把方格墙挤没。
  顺手删掉了一条早就没用的 `.folder--up` 样式（组件用的是 `.folder--parent`）。

覆盖到的测试：

- `src/components/Tutorial.test.tsx`：指向「选择目录」并等操作、选好目录后自动翻页、
  已满足的步骤不再拦人、找不到目标时退回居中卡片、跳过这步、做到之后按钮恢复可用、
  最后一屏与「开始使用」、Esc / ✕ 关闭。
- `e2e/smoke.spec.ts`：走完整套交互流程（浏览器里选不了目录，前两步走「跳过这步」），
  刷新之后不再弹。**注意**：这条用例的名字里必须留着「首次进入的教程」这几个字，
  上面的 beforeEach 靠它决定要不要先把教程标记成看过。

验证：`npm run typecheck`、`npm run lint`（有 1 条 `react(set-state-in-effect)` 警告，
是「用户做到之后自动翻页」那个 effect，属于有意为之，lint 仍然退出 0）、
`npm run test:run`（165 个）、`npm run test:e2e`（7 个）、`npm run build`、
`cd src-tauri && cargo test`（68 个）全绿。

## 上一阶段：教程补上音轨与字幕（已完成）

P1 加的东西教程里没讲，这次补上：

- **教程多一屏**：[Tutorial.tsx](src/components/Tutorial.tsx) 在「底部的灵动岛」之后插入
  「音轨、字幕在这里换」，讲清音频页有什么、外挂字幕怎么挂、双语字幕与延迟字号在哪，
  以及「选过的音轨和字幕会跟着这个视频记住」。步骤结构新增 `points` 字段：键帽那一列回答
  「按哪个键」，这一列回答「能做什么」，视觉上也分开——见 [Tutorial.css](src/components/Tutorial.css)
  里那个圆点列表。
- **[README](README.md) 同步**：控制条那张表补上「音轨与字幕」一行，新增一节讲这两页怎么用，
  并把「已知限制」里已经过期的「字幕、记忆播放位置还在计划中」改掉——这两样现在都能用了。
- **测试**：教程用例原先写死翻 3 页，改成「看按钮在不在」来翻页，以后加减步骤不会再假失败；
  新增一条断言这一屏确实讲了外挂字幕；e2e 的教程用例改成逐屏断言内容（也顺带盯住了步骤顺序）。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（150 个）、`npm run test:e2e`（7 个）、
`npm run build`、`cd src-tauri && cargo test`（53 个）全绿。

**下一步**：见文件开头的「P2 音频进阶（交接说明）」。

## 上一阶段：P1 音频与字幕（已完成）

把播放中最常用的两件事接了出来：换音轨、换输出设备、调声道，以及外挂字幕。
控制条上只多了一个入口（音轨与字幕），面板里分「音频」「字幕」两页。

- **入口**：[Island.tsx](src/components/Island.tsx) 新增 `.island__media`，复用 P0 的
  [Popover.tsx](src/components/Popover.tsx)（这次给它加了 `role`：面板是 `dialog`，倍速菜单仍是 `menu`）。
  内容在 [MediaPanel.tsx](src/components/MediaPanel.tsx)：打开时才挂载，关掉即卸载，不做常驻轮询。
- **音频页**：音轨列表（`aid`）、外挂音轨（`audio-add`）、输出设备列表（`audio-device-list` +
  `audio-device`）、独占模式（`audio-exclusive`）、声道（`audio-channels`）、音频延迟（`audio-delay`）。
- **字幕页**：字幕轨与「关闭字幕」（`sid`）、第二字幕做双语（`secondary-sid`）、加载外挂字幕
  （`sub-add`）、字幕延迟（`sub-delay`）、字号（`sub-font-size`）、位置（`sub-pos`）、
  ASS 样式覆盖（`sub-ass-override`）。
- **状态从哪来**：`player_details` 扩了字段（第二字幕、两个延迟、字号、位置、样式、声道、设备、独占），
  面板每次改动都是「发命令 → 重新读一次 mpv 的真实状态」，不在前端自己推演结果——设备被独占、
  轨道不存在这些情况 mpv 会直接拒绝，界面显示的必须是真正生效的值。设备列表走单独的 `audio_devices`。
- **跨片保持**：全局偏好（输出设备、声道、独占、字号、位置、样式覆盖）落进 `settings.json`；
  每片自己的选择（音轨、字幕、双语、两个延迟）交给 mpv 的 watch-later，并且**换片前会主动发
  `write-watch-later-config`**——`loadfile` 会把上一个文件直接丢掉，不主动写就全没了。
- **踩到的坑（记下来免得再踩）**：`aid` / `sid` / `secondary-sid` 是**整数**属性，mpv 收到 `1.0`
  这种浮点会回 "error accessing property"。IPC 层因此单独加了 `select_track` 发整数，
  `set_number` 只用于真正的浮点属性（音量、倍速、各种延迟与字号）。

覆盖到的测试：

- `src-tauri/src/mpv.rs`：设备列表解析、区间夹取、启动参数（独占与字幕位置按需注入）、详情序列化，
  以及两条真实 mpv 的集成用例——挂外挂字幕之后轨道表里多出一条已选中的外挂字幕；挂外挂音轨之后
  能按 id 选中、`aid=no` 关掉、再选回来（配套一个测试现场写出来的静音 WAV）。
- `src-tauri/src/settings.rs`：新增项的类型与越界折回。
- `src/lib/media.test.ts`：步进（含浮点尾巴）、延迟文本、语言名、轨道标题与副标题。
- `src/components/MediaPanel.test.tsx`：两页的列表、选中态，以及每个控件发出的命令。
- `src/App.controls.test.tsx`：控制条上能打开并收起这个面板。

验证：`npm run typecheck`、`npm run lint`、`npm run test:run`（149 个）、
`npm run test:e2e`（7 个）、`npm run build`、`cd src-tauri && cargo test`（53 个）全绿。

**还没验证到的**：面板在真机上的视觉与手感（列表长度、面板高度、窄窗口下会不会挤），
需要 `npm run tauri dev` 实际点一遍；切换输出设备时的断音与失败回退也只有真机能感受到。

**下一步（P2）**：音频滤镜链（均衡器、响度归一化、变速不变调、环绕上混、透传、采样率与位深）。
完整的交接说明在文件开头的「下一步：P2 音频进阶（交接说明）」。

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

> **版本号与发布方式都由用户拍板**：功能没做完整之前版本号保持 `0.1.1-Alpha`，
> 不因为「加了很多功能」就升号。打包与发 Release 也一样——**用户说发才发**，
> 平时不要自己跑 `tauri build`，也不要在 GitHub 上建 Release。
>
> 现在 `src-tauri/target/release/` 里的东西是早先那次的产物，P3 画面与 P4 十条都没进去。

版本号带 `-Alpha`，MSI 目标不接受非数字的预发布号，所以真要打包时只打 NSIS：

```
npm run tauri build -- --bundles nsis
```

| 产物 | 位置 |
| --- | --- |
| 主程序 | `src-tauri/target/release/fuvideo.exe` |
| 安装包 | `src-tauri/target/release/bundle/nsis/fuvideo_0.1.1-Alpha_x64-setup.exe`（36.1 MB） |

`target/` 在 `.gitignore` 里，产物不进仓库。

## 路线图：播放器能力扩展（P0、P1、P2 已完成，下一步 P3）

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
- 浮层一律走 [Popover.tsx](src/components/Popover.tsx)（点外面收、Esc 收；倍速菜单 `role=menu`，
  音轨与字幕面板 `role=dialog`），需要占地方的就做成整窗浮层（设置页、教程）；
  `prefers-reduced-motion` 下动画关掉。
- 新面板必须接进 `useIdleVisibility` 的判据。现在那条条件是
  `openPanel === null && !settingsOpen && !tutorialOpen`，加新浮层时别忘了往里补一项，
  否则鼠标停在面板上界面会自己隐去。
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

### P1 音频与字幕（已完成，见上面「上一阶段：P1 音频与字幕」）

- 音轨：`track-list` / `aid` / `alang`；外挂音轨 `audio-add` / `--audio-file-auto`。
- 输出设备：`audio-device` + `audio-device-list`（显示 description，不是内部 name）；
  独占模式 `audio-exclusive`（要明确提示会独占设备）。
- 声道：`audio-channels`（mono/stereo/5.1/7.1），进阶 `audio-channel-map`；音频延迟 `audio-delay`。
- 字幕：手动添加 `sub-add`，轨道选择 `sid` / `secondary-sid`（双语），
  `sub-delay` / `sub-pos` / `sub-scale` / `sub-font-size` / `sub-ass-override`；
  自动加载 `--sub-auto=fuzzy` + `--sub-file-paths`。
- 以上选择都要跨片保持（依赖 P0）。

风险：切换输出设备会重建音频管线，有短暂断音，个别驱动下可能失败——需要提示与回退。

### P2 音频进阶（已完成，见上面「P2 音频进阶与设置页」）

- 均衡器 `superequalizer`（18 段）+ 预设；响度归一化 `loudnorm` / `dynaudnorm`。
- 变速不变调 `scaletempo2` / `rubberband` + `audio-pitch-correction`。
- 立体声扩展 `extrastereo`、环绕上混 `surround`、声道重映射 `channelmap` / `pan`。
- 透传 `audio-spdif`（AC3/DTS/EAC3/TrueHD/DTS-HD）；采样率与位深 `audio-samplerate` / `audio-format`。

### P3 画面（下一步就是它，动手前先看文件开头的「P3 画面（交接说明）」）

- 缩放与画幅：`video-zoom` / `panscan` / `video-aspect-override` / `video-align-x,y`。
- 色彩：`brightness` / `contrast` / `saturation` / `hue` / `gamma`。
- 几何：`video-rotate` / `hflip` / `vflip` / `crop` / `cropdetect`。
- 画质档位：`deband` / `sharpen` / `interpolation` / `tscale` / `icc-profile-auto`。
- 硬解：`hwdec` 下拉（自动 / d3d11va / nvdec / amf / 关闭），并用 `hwdec-current` 显示**实际生效**的后端，
  不要把那一百多个名字铺开。
- HDR：`tone-mapping` / `target-peak` / `hdr-contrast-recovery`。
- 快照：`screenshot`（jpg/png/webp/jxl/avif，可带或不带字幕），可指定保存目录。
- 可选：`v360` 做 360° 视角（VR 头显不支持）。

### P4 播放控制与应用层（播放列表、书签已经提前做完）

- ~~播放列表与队列~~：已按「用户提的需求」提前做完（见上面「播放列表、收藏夹与两个 bug 修复」）：
  方格悬停加列表、右上角面板调顺序与移出、看完自动播下一个。**没用 mpv 自己的 playlist**，
  而是应用自己存一份（`collections.json`）再驱动 `loadfile`——因为列表要跨重启保留，
  顺序和界面状态本来就是应用的事。
- 还没做的：循环与随机 `loop-file` / `loop-playlist` / `shuffle`。
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
