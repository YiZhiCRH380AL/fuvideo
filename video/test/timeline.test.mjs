import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INTRO_DURATION_IN_FRAMES,
  INTRO_DURATION_IN_SECONDS,
  INTRO_FPS,
  INTRO_SCENES,
  INTRO_TRANSITION_COUNT,
  RELEASE_NOTICE,
  TRANSITION_DURATION_IN_FRAMES,
  WATERMARK_TEXT,
} from "../src/intro/timeline.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("intro runs between two and three minutes", () => {
  assert.equal(INTRO_FPS, 30);
  assert.equal(INTRO_DURATION_IN_FRAMES, 4500);
  assert.equal(INTRO_DURATION_IN_SECONDS, 150);
  assert.ok(INTRO_DURATION_IN_SECONDS >= 120);
  assert.ok(INTRO_DURATION_IN_SECONDS <= 180);
});

test("spring transitions match the calculated timeline", () => {
  const sceneFrames = INTRO_SCENES.reduce(
    (total, scene) => total + scene.durationInFrames,
    0,
  );

  assert.equal(INTRO_TRANSITION_COUNT, INTRO_SCENES.length - 1);
  assert.equal(TRANSITION_DURATION_IN_FRAMES, 18);
  assert.equal(
    sceneFrames - INTRO_TRANSITION_COUNT * TRANSITION_DURATION_IN_FRAMES,
    INTRO_DURATION_IN_FRAMES,
  );
});

test("scene identifiers and motion visuals are unique", () => {
  const ids = new Set();
  const visuals = new Set();

  for (const scene of INTRO_SCENES) {
    assert.equal(ids.has(scene.id), false, `duplicate scene id: ${scene.id}`);
    assert.equal(
      visuals.has(scene.visual),
      false,
      `duplicate visual: ${scene.visual}`,
    );
    ids.add(scene.id);
    visuals.add(scene.visual);
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
  ]) {
    const contents = readFileSync(join(projectRoot, source), "utf8");
    assert.doesNotMatch(contents, /\b(?:animation|transition)\s*:/);
    assert.match(contents, /useCurrentFrame/);
  }
});

test("watermark and ending release notice are exact", () => {
  assert.equal(WATERMARK_TEXT, "By IkariShinji");
  assert.equal(RELEASE_NOTICE, "已发布预览版，详情见视频简介");

  const outro = INTRO_SCENES.find((scene) => scene.kind === "outro");
  assert.ok(outro);
  assert.equal(outro.releaseNotice, RELEASE_NOTICE);
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
  assert.equal(sampleRate, 22050);
  assert.equal(duration, INTRO_DURATION_IN_SECONDS);
});
