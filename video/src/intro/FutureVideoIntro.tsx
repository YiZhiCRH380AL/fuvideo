import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Audio } from "@remotion/media";

import {
  INTRO_SCENES,
  TRANSITION_DURATION_IN_FRAMES,
  type IntroScene,
} from "./timeline";
import type { FutureVideoIntroProps } from "./config";

const SANS =
  '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const DISPLAY =
  '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const CinematicBackdrop: React.FC<{
  accent: string;
  accentAlt: string;
  progress: number;
}> = ({ accent, accentAlt, progress }) => {
  const frame = useCurrentFrame();
  const driftX = interpolate(progress, [0, 1], [-120, 120]);
  const driftY = Math.sin(frame / 95) * 24;

  return (
    <AbsoluteFill style={{ backgroundColor: "#060914", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.24,
          backgroundImage:
            "linear-gradient(rgba(124,156,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(124,156,255,0.12) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 1050,
          height: 1050,
          borderRadius: "50%",
          left: 960 + driftX,
          top: -390 + driftY,
          background: `radial-gradient(circle, ${accent}42 0%, ${accentAlt}1f 34%, transparent 70%)`,
          filter: "blur(16px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          borderRadius: "50%",
          left: -410 - driftX * 0.45,
          top: 560 - driftY,
          background: `radial-gradient(circle, ${accentAlt}24 0%, transparent 68%)`,
          filter: "blur(22px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: 1010,
          top: 90,
          borderRadius: "50%",
          border: `1px solid ${accent}30`,
          transform: `rotate(${progress * 5}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 660,
          height: 660,
          left: 1130,
          top: 210,
          borderRadius: "50%",
          border: `1px solid ${accentAlt}22`,
          transform: `rotate(${-progress * 7}deg)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(115deg, rgba(3,6,15,0.98) 0%, rgba(3,6,15,0.8) 37%, rgba(3,6,15,0.12) 68%, rgba(3,6,15,0.7) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const BrandMark: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 15,
        fontFamily: DISPLAY,
        color: "#f7f8ff",
      }}
    >
      <Img
        src={staticFile("fuvideo-icon.png")}
        style={{
          width: 48,
          height: 48,
          borderRadius: 13,
          boxShadow: "0 0 35px rgba(108,229,232,0.2)",
        }}
      />
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0.2 }}>
          FutureVideo
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 4,
            color: "rgba(216,224,255,0.48)",
          }}
        >
          YOUR PRIVATE SCREEN
        </div>
      </div>
    </div>
  );
};

const ScreenshotCard: React.FC<{
  scene: IntroScene;
  sceneIndex: number;
  progress: number;
  compact?: boolean;
}> = ({ scene, sceneIndex, progress, compact = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 110, mass: 0.8 },
    durationInFrames: 44,
  });
  const zoom = interpolate(progress, [0, 1], [1.015, 1.055]);
  const translateY = interpolate(entrance, [0, 1], [34, 0]);
  const rotate = interpolate(progress, [0, 1], [1.4, -0.6]);
  const secondaryEntrance = spring({
    frame: frame - 25,
    fps,
    config: { damping: 22, stiffness: 100 },
  });

  const mainWidth = scene.secondaryScreenshot === undefined ? "100%" : "66%";

  return (
    <div
      style={{
        width: compact ? 820 : 990,
        height: compact ? 475 : 592,
        opacity: entrance,
        transform: `translateY(${translateY}px) perspective(1500px) rotateY(${-4 + rotate}deg)`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          gap: 20,
          position: "relative",
        }}
      >
        <div
          style={{
            width: mainWidth,
            height: "100%",
            overflow: "hidden",
            borderRadius: 25,
            border: "1px solid rgba(172,190,255,0.28)",
            background: "#0b1020",
            boxShadow:
              "0 45px 115px rgba(0,0,0,0.64), 0 0 55px rgba(108,229,232,0.08)",
          }}
        >
          <div
            style={{
              height: 38,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 17px",
              borderBottom: "1px solid rgba(160,180,255,0.15)",
              background: "rgba(12,17,34,0.96)",
            }}
          >
            <span style={dotStyle("#ff6b6b")} />
            <span style={dotStyle("#ffd166")} />
            <span style={dotStyle("#63d7a3")} />
            <span
              style={{
                marginLeft: 12,
                fontFamily: SANS,
                fontSize: 12,
                letterSpacing: 2.2,
                color: "rgba(222,230,255,0.5)",
              }}
            >
              FUTUREVIDEO / {String(sceneIndex + 1).padStart(2, "0")}
            </span>
          </div>
          <div style={{ height: "calc(100% - 38px)", overflow: "hidden" }}>
            <Img
              src={staticFile(scene.screenshot)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${zoom})`,
                transformOrigin: "center",
              }}
            />
          </div>
        </div>

        {scene.secondaryScreenshot === undefined ? null : (
          <div
            style={{
              width: "34%",
              alignSelf: "flex-end",
              height: "69%",
              opacity: secondaryEntrance,
              transform: `translateY(${interpolate(
                secondaryEntrance,
                [0, 1],
                [42, 0],
              )}px) rotate(1.5deg)`,
              overflow: "hidden",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.32)",
              background: "#eae6dd",
              boxShadow: "0 30px 80px rgba(0,0,0,0.52)",
            }}
          >
            <Img
              src={staticFile(scene.secondaryScreenshot)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const dotStyle = (background: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  background,
  opacity: 0.8,
});

const PointChips: React.FC<{ points: readonly string[]; accent: string }> = ({
  points,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 42 }}>
      {points.map((point, index) => {
        const entrance = spring({
          frame: frame - 28 - index * 7,
          fps,
          config: { damping: 24, stiffness: 125 },
          durationInFrames: 30,
        });

        return (
          <div
            key={point}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 17px",
              borderRadius: 999,
              border: `1px solid ${accent}45`,
              background: `${accent}12`,
              color: "rgba(237,241,255,0.86)",
              fontFamily: SANS,
              fontSize: 18,
              fontWeight: 500,
              opacity: entrance,
              transform: `translateY(${interpolate(entrance, [0, 1], [16, 0])}px)`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: accent,
                boxShadow: `0 0 12px ${accent}`,
              }}
            />
            {point}
          </div>
        );
      })}
    </div>
  );
};

const CopyBlock: React.FC<{
  scene: IntroScene;
  compact?: boolean;
}> = ({ scene, compact = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 26, stiffness: 95 },
    durationInFrames: 42,
  });
  const descriptionEntrance = spring({
    frame: frame - 16,
    fps,
    config: { damping: 26, stiffness: 100 },
    durationInFrames: 38,
  });

  const titleSize = compact ? 92 : 78;

  return (
    <div
      style={{
        width: compact ? 690 : 660,
        opacity: entrance,
        transform: `translateY(${interpolate(entrance, [0, 1], [34, 0])}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 26,
          color: scene.accentAlt,
          fontFamily: SANS,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 4.5,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 42,
            height: 2,
            background: scene.accentAlt,
            boxShadow: `0 0 15px ${scene.accentAlt}`,
          }}
        />
        {scene.kicker}
      </div>

      <div
        style={{
          whiteSpace: "pre-line",
          color: "#f7f8ff",
          fontFamily: DISPLAY,
          fontSize: titleSize,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -2.6,
          textShadow: "0 10px 45px rgba(0,0,0,0.35)",
        }}
      >
        {scene.title}
      </div>

      <div
        style={{
          maxWidth: 640,
          marginTop: 30,
          color: "rgba(219,226,247,0.72)",
          fontFamily: SANS,
          fontSize: 25,
          fontWeight: 400,
          lineHeight: 1.65,
          opacity: descriptionEntrance,
          transform: `translateY(${interpolate(
            descriptionEntrance,
            [0, 1],
            [18, 0],
          )}px)`,
        }}
      >
        {scene.description}
      </div>

      <PointChips points={scene.points} accent={scene.accent} />
    </div>
  );
};

const Scene: React.FC<{
  scene: IntroScene;
  index: number;
}> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const opening = scene.kind === "opening";
  const outro = scene.kind === "outro";

  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <CinematicBackdrop
        accent={scene.accent}
        accentAlt={scene.accentAlt}
        progress={progress}
      />

      <div
        style={{
          position: "absolute",
          left: 112,
          top: 70,
          display: "flex",
          alignItems: "center",
        }}
      >
        <BrandMark />
      </div>

      <div
        style={{
          position: "absolute",
          left: 112,
          top: opening || outro ? 275 : 225,
          bottom: 170,
          display: "flex",
          alignItems: "center",
        }}
      >
        <CopyBlock scene={scene} compact={opening || outro} />
      </div>

      <div
        style={{
          position: "absolute",
          left: opening ? 860 : 805,
          top: 270,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ScreenshotCard
          scene={scene}
          sceneIndex={index}
          progress={progress}
          compact={opening || outro}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 112,
          bottom: 66,
          display: "flex",
          alignItems: "center",
          gap: 20,
          color: "rgba(222,230,255,0.46)",
          fontFamily: SANS,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 3.2,
        }}
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span style={{ color: "rgba(222,230,255,0.2)" }}>/</span>
        <span>{String(INTRO_SCENES.length).padStart(2, "0")}</span>
        <div
          style={{
            width: 300,
            height: 2,
            marginLeft: 10,
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${((index + progress) / INTRO_SCENES.length) * 100}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${scene.accent}, ${scene.accentAlt})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Watermark: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 100 },
  });

  return (
    <div
      style={{
        position: "absolute",
        right: 56,
        bottom: 54,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 17px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(3,6,15,0.62)",
        boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px)",
        color: "rgba(246,248,255,0.78)",
        fontFamily: SANS,
        fontSize: 17,
        fontWeight: 600,
        letterSpacing: 0.8,
        opacity: entrance,
        transform: `translateY(${interpolate(entrance, [0, 1], [8, 0])}px)`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#6ce5e8",
          boxShadow: "0 0 12px rgba(108,229,232,0.95)",
        }}
      />
      {text}
    </div>
  );
};

export const FutureVideoIntro: React.FC<FutureVideoIntroProps> = ({
  watermark,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#060914" }}>
      <Audio
        src={staticFile("audio/futurevideo-ambient.wav")}
        volume={0.42}
      />

      <TransitionSeries>
        {INTRO_SCENES.flatMap((scene, index) => {
          const nodes: React.ReactNode[] = [];

          if (index > 0) {
            nodes.push(
              <TransitionSeries.Transition
                key={`transition-${scene.id}`}
                presentation={fade()}
                timing={linearTiming({
                  durationInFrames: TRANSITION_DURATION_IN_FRAMES,
                })}
              />,
            );
          }

          nodes.push(
            <TransitionSeries.Sequence
              key={scene.id}
              durationInFrames={scene.durationInFrames}
            >
              <Scene scene={scene} index={index} />
            </TransitionSeries.Sequence>,
          );

          return nodes;
        })}
      </TransitionSeries>

      <Watermark text={watermark} />
    </AbsoluteFill>
  );
};
