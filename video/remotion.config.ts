// Project-wide render defaults. Anything set here is the baseline for
// `npx remotion render` / `npx remotion studio`; CLI flags still override it.
// Docs: https://www.remotion.dev/docs/config
import { Config } from "@remotion/cli/config";

// JPEG frames render meaningfully faster than PNG and are indistinguishable
// for these templates (no per-frame alpha needed in the final MP4).
Config.setVideoImageFormat("jpeg");

// Overwrite the output file instead of erroring when it already exists.
Config.setOverwriteOutput(true);

// H.264 is the safe default for social platforms and web playback.
Config.setCodec("h264");

// Concurrency = frames rendered in parallel. Bump it if you have spare CPU
// cores; lower it on CI runners with tight memory. Overridable from the
// environment (see .env.example) so CI can tune it without editing code.
const envConcurrency = Number(process.env.REMOTION_CONCURRENCY);
Config.setConcurrency(
  Number.isFinite(envConcurrency) && envConcurrency > 0
    ? Math.floor(envConcurrency)
    : 4,
);
