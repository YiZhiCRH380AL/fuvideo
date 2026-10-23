import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INTRO_DURATION_IN_FRAMES,
  INTRO_DURATION_IN_SECONDS,
  INTRO_FPS,
  INTRO_SCENES,
  INTRO_TRANSITION_COUNT,
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

test("transition arithmetic matches the calculated timeline", () => {
  const sceneFrames = INTRO_SCENES.reduce(
    (total, scene) => total + scene.durationInFrames,
    0,
  );

  assert.equal(INTRO_TRANSITION_COUNT, INTRO_SCENES.length - 1);
  assert.equal(
    sceneFrames - INTRO_TRANSITION_COUNT * TRANSITION_DURATION_IN_FRAMES,
    INTRO_DURATION_IN_FRAMES,
  );
});

test("scene identifiers and screenshots are present and unique", () => {
  const ids = new Set();

  for (const scene of INTRO_SCENES) {
    assert.equal(ids.has(scene.id), false, `duplicate scene id: ${scene.id}`);
    ids.add(scene.id);
    assert.ok(scene.durationInFrames > 0);
    assert.ok(scene.points.length > 0);
    assert.ok(
      existsSync(join(projectRoot, "public", scene.screenshot)),
      `missing screenshot: ${scene.screenshot}`,
    );

    if (scene.secondaryScreenshot !== undefined) {
      assert.ok(
        existsSync(join(projectRoot, "public", scene.secondaryScreenshot)),
        `missing secondary screenshot: ${scene.secondaryScreenshot}`,
      );
    }
  }
});

test("watermark is exact and the edit covers the documented product features", () => {
  assert.equal(WATERMARK_TEXT, "By IkariShinji");

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
  assert.ok(existsSync(audioPath), "run `npm run soundtrack` first");

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
