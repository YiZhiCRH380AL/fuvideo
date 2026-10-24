import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INTRO_DURATION_IN_FRAMES,
  INTRO_DURATION_IN_SECONDS,
  INTRO_BPM,
  INTRO_FPS,
  INTRO_SCENES,
  INTRO_SCENE_STARTS_IN_FRAMES,
  INTRO_TRANSITION_COUNT,
  RELEASE_NOTICE,
  TRANSITION_DURATION_IN_FRAMES,
  WATERMARK_TEXT,
} from "../src/intro/timeline.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("intro uses a flexible short-form duration", () => {
  assert.equal(INTRO_FPS, 30);
  assert.equal(INTRO_BPM, 120);
  assert.equal(INTRO_DURATION_IN_FRAMES, 2520);
  assert.equal(INTRO_DURATION_IN_SECONDS, 84);
  assert.ok(INTRO_DURATION_IN_SECONDS >= 60);
  assert.ok(INTRO_DURATION_IN_SECONDS <= 120);
});

test("package metadata and usage notes match the rendered duration", () => {
  const packageJson = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
  );
  const readme = readFileSync(join(projectRoot, "README.md"), "utf8");

  assert.match(packageJson.description, /84-second introduction video/);
  assert.equal(packageJson.engines.node, ">=22.18.0");
  assert.match(readme, /1920x1080，30fps，84 秒/);
  assert.doesNotMatch(readme, /150 秒|2 分 30 秒/);
});

test("spring transitions match the calculated timeline", () => {
  const sceneFrames = INTRO_SCENES.reduce(
    (total, scene) => total + scene.durationInFrames,
    0,
  );

  assert.equal(INTRO_TRANSITION_COUNT, INTRO_SCENES.length - 1);
  assert.equal(TRANSITION_DURATION_IN_FRAMES, 15);
  assert.equal(
    sceneFrames - INTRO_TRANSITION_COUNT * TRANSITION_DURATION_IN_FRAMES,
    INTRO_DURATION_IN_FRAMES,
  );
});

test("all scene starts land on the 120 BPM half-beat grid", () => {
  assert.equal(INTRO_SCENE_STARTS_IN_FRAMES.length, INTRO_SCENES.length);
  assert.equal(INTRO_SCENE_STARTS_IN_FRAMES[0], 0);

  for (let index = 1; index < INTRO_SCENE_STARTS_IN_FRAMES.length; index += 1) {
    const previous = INTRO_SCENE_STARTS_IN_FRAMES[index - 1];
    const current = INTRO_SCENE_STARTS_IN_FRAMES[index];
    assert.ok(current > previous);
    assert.equal(current % 15, 0, `scene ${index} is off the beat grid`);
  }
});

test("scene identifiers and motion visuals are unique", () => {
  const ids = new Set();
  const visuals = new Set();
  const layouts = new Set();

  for (const scene of INTRO_SCENES) {
    assert.equal(ids.has(scene.id), false, `duplicate scene id: ${scene.id}`);
    assert.equal(
      visuals.has(scene.visual),
      false,
      `duplicate visual: ${scene.visual}`,
    );
    ids.add(scene.id);
    visuals.add(scene.visual);
    assert.equal(
      layouts.has(scene.layout),
      false,
      `duplicate layout: ${scene.layout}`,
    );
    layouts.add(scene.layout);
    assert.ok(scene.durationInFrames > 0);
    assert.ok(scene.points.length > 0);
  }
});

test("the video uses code-native UI instead of image screenshots", () => {
  const publicFiles = readdirSync(join(projectRoot, "public"), {
    recursive: true,
  });
  const images = publicFiles.filter((file) =>
    [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"].includes(
      extname(String(file)).toLowerCase(),
    ),
  );

  assert.deepEqual(images, []);
});

test("all visible motion stays Remotion-frame driven", () => {
  for (const source of [
    "src/intro/FutureVideoIntro.tsx",
    "src/intro/AppMockup.tsx",
    "src/intro/BrandMark.tsx",
  ]) {
    const contents = readFileSync(join(projectRoot, source), "utf8");
    assert.doesNotMatch(contents, /\b(?:animation|transition)\s*:/);
    assert.match(contents, /useCurrentFrame/);
  }
});

test("video uses the official split-play mark and embedded CJK font", () => {
  const mark = readFileSync(join(projectRoot, "src/intro/BrandMark.tsx"), "utf8");
  const intro = readFileSync(
    join(projectRoot, "src/intro/FutureVideoIntro.tsx"),
    "utf8",
  );
  const appMockup = readFileSync(
    join(projectRoot, "src/intro/AppMockup.tsx"),
    "utf8",
  );
  const font = readFileSync(
    join(projectRoot, "public/fonts/FutureVideoSans.ttf"),
  );

  assert.match(mark, /M 378 296 L 506 399/);
  assert.match(mark, /M 530 418 L 646 512/);
  assert.match(intro, /FutureVideoSans\.ttf/);
  assert.match(intro, /document\.fonts\.add/);
  assert.equal(font.subarray(0, 4).toString("hex"), "00010000");
  assert.ok(font.length > 50_000);

  for (const source of [mark, intro, appMockup]) {
    assert.doesNotMatch(source, /[★⚙◇●▶◀◖⛶Ⅱ↗]/);
  }
});

test("watermark and ending release notice are exact", () => {
  assert.equal(WATERMARK_TEXT, "By IkariShinji");
  assert.equal(RELEASE_NOTICE, "已发布预览版，详情见视频简介");

  const outro = INTRO_SCENES.find((scene) => scene.kind === "outro");
  assert.ok(outro);
  assert.equal(outro.releaseNotice, RELEASE_NOTICE);
  assert.ok(outro.points.every((point) => !/github|https?:|\.com/i.test(point)));
});

test("the edit covers the documented product features", () => {
  const copy = INTRO_SCENES.map(
    (scene) => `${scene.title} ${scene.description} ${scene.points.join(" ")}`,
  ).join(" ");

  for (const required of [
    "本地",
    "片库",
    "字幕",
    "音轨",
    "主题",
    "AB 循环",
    "收藏夹",
  ]) {
    assert.ok(copy.includes(required), `missing feature copy: ${required}`);
  }
});

test("generated ambient soundtrack spans the full video", () => {
  const audioPath = join(
    projectRoot,
    "public",
    "audio",
    "futurevideo-ambient.wav",
  );

  const wav = readFileSync(audioPath);
  const sampleRate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22);
  const bitsPerSample = wav.readUInt16LE(34);
  const dataBytes = wav.readUInt32LE(40);
  const duration =
    dataBytes / (sampleRate * channels * (bitsPerSample / 8));

  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(channels, 1);
  assert.equal(sampleRate, 32000);
  assert.equal(duration, INTRO_DURATION_IN_SECONDS);

  let squared = 0;
  let peak = 0;
  const sampleCount = dataBytes / 2;
  for (let offset = 44; offset < wav.length; offset += 4) {
    const sample = wav.readInt16LE(offset);
    peak = Math.max(peak, Math.abs(sample));
    squared += sample * sample;
  }

  const sampledRms = Math.sqrt(squared / Math.ceil(sampleCount / 2));
  assert.ok(sampledRms > 2500, `soundtrack RMS too quiet: ${sampledRms}`);
  // The final bus keeps ~3 dB of inter-sample headroom after soft compression.
  assert.ok(peak > 17_000, `soundtrack peak too quiet: ${peak}`);
});
