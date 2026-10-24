import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INTRO_BPM,
  INTRO_DURATION_IN_SECONDS,
  INTRO_SCENE_STARTS_IN_SECONDS,
} from "../src/intro/timeline.ts";

const sampleRate = 32000;
const durationSeconds = INTRO_DURATION_IN_SECONDS;
const totalSamples = sampleRate * durationSeconds;
const samples = new Float32Array(totalSamples);
const beatSeconds = 60 / INTRO_BPM;
const barSeconds = beatSeconds * 4;

let noiseSeed = 0x5f3759df;
const noise = () => {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
  return (noiseSeed / 0xffffffff) * 2 - 1;
};

const smoothstep = (value) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

const addVoice = ({
  start,
  length,
  frequency,
  amplitude,
  attack = 0.03,
  release = 0.15,
  harmonics = [1, 0.22, 0.08],
  phaseOffset = 0,
}) => {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(
    totalSamples,
    Math.ceil((start + length) * sampleRate),
  );
  const attackSamples = Math.max(1, attack * sampleRate);
  const releaseSamples = Math.max(1, release * sampleRate);

  for (let index = first; index < last; index += 1) {
    const local = index - first;
    const remaining = last - index;
    const envelope =
      smoothstep(local / attackSamples) *
      smoothstep(remaining / releaseSamples);
    const time = index / sampleRate + phaseOffset;
    let value = 0;
    harmonics.forEach((gain, harmonic) => {
      value +=
        Math.sin(2 * Math.PI * frequency * (harmonic + 1) * time) * gain;
    });
    samples[index] += value * amplitude * envelope;
  }
};

const addKick = (start, amplitude = 0.24) => {
  const first = Math.floor(start * sampleRate);
  const length = Math.floor(sampleRate * 0.24);
  for (let offset = 0; offset < length; offset += 1) {
    const index = first + offset;
    if (index < 0 || index >= totalSamples) {
      continue;
    }
    const time = offset / sampleRate;
    const pitch = 128 * Math.exp(-time * 20) + 42;
    const envelope = Math.exp(-time * 13);
    samples[index] += Math.sin(2 * Math.PI * pitch * time) * envelope * amplitude;
  }
};

const addSnare = (start, amplitude = 0.14) => {
  const first = Math.floor(start * sampleRate);
  const length = Math.floor(sampleRate * 0.18);
  let previousNoise = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const index = first + offset;
    if (index < 0 || index >= totalSamples) {
      continue;
    }
    const time = offset / sampleRate;
    const raw = noise();
    const high = raw - previousNoise * 0.72;
    previousNoise = raw;
    const body = Math.sin(2 * Math.PI * 178 * time) * 0.38;
    samples[index] +=
      (high * 0.68 + body) * Math.exp(-time * 24) * amplitude;
  }
};

const addHat = (start, amplitude = 0.055, open = false) => {
  const first = Math.floor(start * sampleRate);
  const length = Math.floor(sampleRate * (open ? 0.16 : 0.055));
  let previousNoise = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const index = first + offset;
    if (index < 0 || index >= totalSamples) {
      continue;
    }
    const raw = noise();
    const high = raw - previousNoise;
    previousNoise = raw;
    const time = offset / sampleRate;
    samples[index] +=
      high * Math.exp(-time * (open ? 20 : 58)) * amplitude;
  }
};

const addRiser = (start, length) => {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(totalSamples, Math.ceil((start + length) * sampleRate));
  for (let index = first; index < last; index += 1) {
    const progress = (index - first) / Math.max(1, last - first);
    const time = index / sampleRate;
    const tone = Math.sin(2 * Math.PI * (280 + progress * 920) * time);
    samples[index] +=
      (noise() * 0.34 + tone * 0.22) *
      progress *
      progress *
      (1 - progress) *
      0.13;
  }
};

// Fmaj9 → G6 → Em7 → Am7. The upper voicings and 16th-note arpeggio keep the
// track bright while the root bass gives the UI cuts a clear pulse.
const chords = [
  [174.61, 220, 261.63, 329.63],
  [196, 246.94, 293.66, 329.63],
  [164.81, 196, 246.94, 293.66],
  [220, 261.63, 329.63, 392],
];

for (let bar = 0; bar * barSeconds < durationSeconds; bar += 1) {
  const chord = chords[bar % chords.length];
  const start = bar * barSeconds - 0.14;
  chord.forEach((frequency, index) => {
    addVoice({
      start,
      length: barSeconds + 0.6,
      frequency,
      amplitude: index === 0 ? 0.032 : 0.022,
      attack: 0.18,
      release: 0.34,
      harmonics: [1, 0.16, 0.05],
    });
  });

  for (let step = 0; step < 16; step += 1) {
    const stepStart = bar * barSeconds + step * (beatSeconds / 4);
    const note = chord[(step + bar) % chord.length] * (step % 4 === 3 ? 3 : 2);
    addVoice({
      start: stepStart,
      length: 0.19,
      frequency: note,
      amplitude: step % 4 === 0 ? 0.047 : 0.032,
      attack: 0.008,
      release: 0.18,
      harmonics: [1, 0.16],
    });
  }
}

for (let beat = 0; beat * beatSeconds < durationSeconds; beat += 1) {
  const start = beat * beatSeconds;
  const barBeat = beat % 4;
  addKick(start, barBeat === 0 ? 0.28 : 0.23);
  addHat(start + beatSeconds / 2, 0.048);
  addHat(start + beatSeconds / 4, 0.024);
  addHat(start + (beatSeconds * 3) / 4, 0.03);
  if (barBeat === 1 || barBeat === 3) {
    addSnare(start, 0.13);
  }

  addVoice({
    start,
    length: beatSeconds * 0.78,
    frequency: chords[Math.floor(beat / 4) % chords.length][0] / 2,
    amplitude: 0.115,
    attack: 0.01,
    release: 0.16,
    harmonics: [1, 0.18, 0.08],
  });
}

INTRO_SCENE_STARTS_IN_SECONDS.slice(1).forEach((start) => {
  addRiser(start - 0.42, 0.42);
  addKick(start, 0.34);
  addSnare(start, 0.18);
  addHat(start, 0.09, true);
});

for (let index = 0; index < totalSamples; index += 1) {
  const seconds = index / sampleRate;
  const fadeIn = smoothstep(seconds / 1.6);
  const fadeOut = smoothstep((durationSeconds - seconds) / 3);
  samples[index] *= fadeIn * fadeOut;
}

let peak = 0;
let squaredEnergy = 0;
for (let index = 0; index < totalSamples; index += 1) {
  // Gentle bus saturation lifts the pads and arpeggio without letting kick
  // transients force the whole soundtrack to a quiet peak-normalized level.
  const shaped = Math.tanh(samples[index] * 2.8);
  samples[index] = shaped;
  peak = Math.max(peak, Math.abs(shaped));
  squaredEnergy += shaped * shaped;
}

const normalizedPeak = 0.58;
const gain = peak === 0 ? 1 : normalizedPeak / peak;
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

const rms = Math.sqrt(squaredEnergy / totalSamples) * gain;
console.log(
  `Generated ${durationSeconds}s / ${INTRO_BPM} BPM soundtrack at ${outputPath} ` +
    `(${wav.length} bytes, RMS ${rms.toFixed(3)})`,
);
