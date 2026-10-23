import type { CalculateMetadataFunction } from "remotion";
import { z } from "zod";

import {
  INTRO_DURATION_IN_FRAMES,
  INTRO_FPS,
  INTRO_HEIGHT,
  INTRO_WIDTH,
  WATERMARK_TEXT,
} from "./timeline";

export const futureVideoIntroSchema = z.object({
  watermark: z.string().min(1),
});

export type FutureVideoIntroProps = z.infer<typeof futureVideoIntroSchema>;

export const futureVideoIntroDefaultProps: FutureVideoIntroProps = {
  watermark: WATERMARK_TEXT,
};

export const futureVideoIntroCalculateMetadata: CalculateMetadataFunction<
  FutureVideoIntroProps
> = () => ({
  durationInFrames: INTRO_DURATION_IN_FRAMES,
  fps: INTRO_FPS,
  width: INTRO_WIDTH,
  height: INTRO_HEIGHT,
});
