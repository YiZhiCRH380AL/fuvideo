# FutureVideo 介绍视频

这是 `FutureVideoIntro` 的 Remotion 源码。项目从 MIT 许可的
[`AleBrito124356/remotion-video-templates`](https://github.com/AleBrito124356/remotion-video-templates)
实装后精简而来，许可证和改动说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## 规格

- 1920x1080，30fps，84 秒，120 BPM 节拍网格
- 8 个场景，全部为代码绘制的应用界面动效，不使用界面截图
- 真实中缝播放三角图标、嵌入式 Noto Sans SC 中文字体子集
- 全程推镜、过冲入场、快速切场、动态光标、进度预览、频谱与主题换色
- 原创 120 BPM 电子节拍配乐，场景切点与半拍网格对齐
- 持续显示 `By IkariShinji` 水印
- 结尾显示「已发布预览版，详情见视频简介」
- H.264 + AAC 成片，内置离线生成的原创环境垫乐

## 本地命令

```powershell
# 需要 Node.js 22.18+（测试与配乐脚本直接读取 TypeScript 时间线）
npm install
npm run soundtrack
npm test
npm run typecheck

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npx remotion render FutureVideoIntro out/futurevideo-intro.mp4 `
  --browser-executable=$chrome --crf=20 --concurrency=4
```

成片输出到 `out/futurevideo-intro.mp4`。也可以运行 `npm run studio`
打开 Remotion 的时间线预览；本仓库的自动验证不会启动可见窗口。

## 修改内容

- 文案与镜头时长：`src/intro/timeline.ts`
- 画面、动画和水印：`src/intro/FutureVideoIntro.tsx`
- 程序化应用界面：`src/intro/AppMockup.tsx`
- 品牌图标：`src/intro/BrandMark.tsx`
- 配乐生成：`scripts/generate-soundtrack.mjs`
- 时间线与水印测试：`test/timeline.test.mjs`
