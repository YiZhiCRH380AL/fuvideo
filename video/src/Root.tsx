import React from "react";
import { Composition } from "remotion";

import {
  futureVideoIntroCalculateMetadata,
  futureVideoIntroDefaultProps,
  futureVideoIntroSchema,
} from "./intro/config";
import { FutureVideoIntro } from "./intro/FutureVideoIntro";
import {
  INTRO_DURATION_IN_FRAMES,
  INTRO_FPS,
  INTRO_HEIGHT,
  INTRO_WIDTH,
} from "./intro/timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FutureVideoIntro"
      component={FutureVideoIntro}
      schema={futureVideoIntroSchema}
      defaultProps={futureVideoIntroDefaultProps}
      calculateMetadata={futureVideoIntroCalculateMetadata}
      durationInFrames={INTRO_DURATION_IN_FRAMES}
      fps={INTRO_FPS}
      width={INTRO_WIDTH}
      height={INTRO_HEIGHT}
    />
  );
};
