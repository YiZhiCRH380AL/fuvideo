import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { INTRO_DURATION_IN_SECONDS } from "../src/intro/timeline.ts";

const sampleRate = 22050;
const durationSeconds = INTRO_DURATION_IN_SECONDS;
const totalSamples = sampleRate * durationSeconds;
const samples = new Float32Array(totalSamples);

const chords = [
  [146.83, 174.61, 220.0, 293.66],
  [116.54, 146.83, 174.61, 233.08],
  [87.31, 130.81, 174.61, 220.0],
  [130.81, 164.81, 196.0, 261.63],
  [146.83, 174.61, 220.0, 293.66],
  [98.0, 146.83, 196.0, 246.94],
  [116.54, 146.83, 174.61, 233.08],
  [130.81, 164.81, 196.0, 261.63],
  [87.31, 130.81, 174.61, 220.0],
  [146.83, 174.61, 220.0, 293.66],
];

const chordSeconds = durationSeconds / chords.length;

const smoothstep = (value) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

const addTone = (startSecond, toneSeconds, frequency, amplitude) => {
  const start = Math.max(0, Math.floor(startSecond * sampleRate));
  const end = Math.min(
    totalSamples,
    Math.ceil((startSecond + toneSeconds) * sampleRate),
  );
  const attackSamples = Math.floor(sampleRate * 0.7);
  const releaseSamples = Math.floor(sampleRate * 1.4);

  for (let index = start; index < end; index += 1) {
    const local = index - start;
    const attack = smoothstep(local / attackSamples);
    const release = smoothstep((end - index) / releaseSamples);
    const time = local / sampleRate;
    const detune = 1 + 0.0016 * Math.sin(time * 0.45);
    const tremolo = 0.84 + 0.16 * Math.sin(time * Math.PI * 0.32);
    const fundamental =
      Math.sin(2 * Math.PI * frequency * detune * time) * 0.72 +
      Math.sin(2 * Math.PI * frequency * 2.002 * time) * 0.18 +
      Math.sin(2 * Math.PI * frequency * 0.501 * time) * 0.1;

    samples[index] += fundamental * amplitude * attack * release * tremolo;
  }
};

chords.forEach((chord, chordIndex) => {
  const start = chordIndex * chordSeconds - 1.4;
  const toneSeconds = chordSeconds + 2.8;

  chord.forEach((frequency, noteIndex) => {
    addTone(start, toneSeconds, frequency, noteIndex === 0 ? 0.046 : 0.033);
  });

  // A quiet upper note gives each phrase a gentle sense of movement.
  addTone(
    chordIndex * chordSeconds + 3.8,
    5.2,
    chord[3] * 2,
    chordIndex % 2 === 0 ? 0.018 : 0.014,
  );
});

for (let index = 0; index < totalSamples; index += 1) {
  const seconds = index / sampleRate;
  const fadeIn = smoothstep(seconds / 4);
  const fadeOut = smoothstep((durationSeconds - seconds) / 7);
  samples[index] *= fadeIn * fadeOut;
}

let peak = 0;
for (const sample of samples) {
  peak = Math.max(peak, Math.abs(sample));
}

const gain = peak === 0 ? 1 : 0.58 / peak;
const dataBytes = totalSamples * 2;
const wav = Buffer.alloc(44 + dataBytes);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataBytes, 40);

for (let index = 0; index < totalSamples; index += 1) {
  const value = Math.max(-1, Math.min(1, samples[index] * gain));
  wav.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(projectRoot, "public", "audio");
const outputPath = join(outputDirectory, "futurevideo-ambient.wav");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, wav);

console.log(
  `Generated ${durationSeconds}s ambient soundtrack at ${outputPath} (${wav.length} bytes)`,
);
