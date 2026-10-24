import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";

import { AppMockup } from "./AppMockup";
import type { FutureVideoIntroProps } from "./config";
import {
  INTRO_SCENES,
  TRANSITION_DURATION_IN_FRAMES,
  type IntroScene,
} from "./timeline";

const SANS =
  '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const DISPLAY =
  '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const reveal = (
  frame: number,
  fps: number,
  delay = 0,
  duration = 32,
): number =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 200, stiffness: 115, mass: 0.8 },
    durationInFrames: duration,
  });

const BrandGlyph: React.FC<{ size: number; accent: string }> = ({
  size,
  accent,
}) => (
  <div
    style={{
      position: "relative",
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      borderRadius: size * 0.28,
      background: `linear-gradient(145deg, ${accent}, #6ce5e8)`,
      boxShadow: `0 0 34px ${accent}50`,
      overflow: "hidden",
    }}
  >
    {[0.31, 0.5, 0.69].map((position, index) => (
      <span
        key={position}
        style={{
          position: "absolute",
          left: size * position,
          top: size * (index === 1 ? 0.24 : 0.34),
          width: size * 0.065,
          height: size * (index === 1 ? 0.52 : 0.32),
          borderRadius: 99,
          background: "rgba(255,255,255,0.92)",
        }}
      />
    ))}
  </div>
);

const Particles: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 28 }, (_, index) => {
    const baseX = random(`particle-x-${index}`) * 1920;
    const baseY = random(`particle-y-${index}`) * 1080;
    const speed = 0.18 + random(`particle-speed-${index}`) * 0.5;
    const size = 1.4 + random(`particle-size-${index}`) * 3.2;
    const drift = Math.sin(frame / (42 + index) + index) * (7 + speed * 8);
    const lift = ((frame * speed + index * 37) % 160) - 80;
    const opacity =
      0.12 +
      Math.abs(Math.sin(frame / (55 + index * 2) + index * 0.9)) * 0.36;

    return (
      <div
        key={index}
        style={{
          position: "absolute",
          left: baseX + drift,
          top: baseY + lift,
          width: size,
          height: size,
          borderRadius: "50%",
          background: index % 3 === 0 ? accentAlt : accent,
          boxShadow: `0 0 ${size * 3}px ${index % 3 === 0 ? accentAlt : accent}`,
          opacity,
        }}
      />
    );
  });

  return <AbsoluteFill>{particles}</AbsoluteFill>;
};

const CinematicBackdrop: React.FC<{
  accent: string;
  accentAlt: string;
  progress: number;
}> = ({ accent, accentAlt, progress }) => {
  const frame = useCurrentFrame();
  const driftX = interpolate(progress, [0, 1], [-120, 120], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const glowScale = 1 + Math.sin(frame / 76) * 0.045;
  const beamX = interpolate(progress, [0, 1], [-260, 1700], {
    ...clamp,
    easing: Easing.inOut(Easing.sin),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#050812", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.2,
          backgroundImage:
            "linear-gradient(rgba(124,156,255,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(124,156,255,0.11) 1px, transparent 1px)",
          backgroundSize: "76px 76px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 1120,
          height: 1120,
          left: 870 + driftX,
          top: -430,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}43 0%, ${accentAlt}20 36%, transparent 70%)`,
          filter: "blur(18px)",
          transform: `scale(${glowScale})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 880,
          height: 880,
          left: -490 - driftX * 0.45,
          top: 550,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentAlt}23 0%, transparent 68%)`,
          filter: "blur(24px)",
          transform: `scale(${2 - glowScale})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 460,
          height: 1500,
          left: beamX,
          top: -230,
          transform: "rotate(18deg)",
          background: `linear-gradient(90deg, transparent, ${accentAlt}0d, ${accent}18, transparent)`,
          filter: "blur(7px)",
        }}
      />

      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            width: 760 + index * 210,
            height: 760 + index * 210,
            left: 1000 - index * 90,
            top: 80 - index * 70,
            borderRadius: "50%",
            border: `1px solid ${index % 2 === 0 ? accent : accentAlt}${index === 1 ? "29" : "18"}`,
            transform: `rotate(${progress * (3.5 + index * 2)}deg)`,
          }}
        />
      ))}

      <Particles accent={accent} accentAlt={accentAlt} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(112deg, rgba(3,6,15,0.98) 0%, rgba(3,6,15,0.83) 36%, rgba(3,6,15,0.12) 70%, rgba(3,6,15,0.68) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const HeaderBrand: React.FC<{ accent: string }> = ({ accent }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <BrandGlyph size={46} accent={accent} />
    <div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: "#f8f9ff",
        }}
      >
        FutureVideo
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: SANS,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 4,
          color: "rgba(216,224,255,0.42)",
        }}
      >
        YOUR PRIVATE SCREEN
      </div>
    </div>
  </div>
);

const AnimatedTitle: React.FC<{
  title: string;
  compact: boolean;
}> = ({ title, compact }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = title.split("\n");

  return (
    <div
      style={{
        color: "#f8f9ff",
        fontFamily: DISPLAY,
        fontSize: compact ? 88 : 72,
        fontWeight: 700,
        lineHeight: 1.08,
        letterSpacing: -2.4,
        textShadow: "0 12px 44px rgba(0,0,0,0.35)",
      }}
    >
      {lines.map((line, index) => {
        const entrance = reveal(frame, fps, 8 + index * 7, 34);
        return (
          <div
            key={`${line}-${index}`}
            style={{ overflow: "hidden", paddingBottom: 3 }}
          >
            <div
              style={{
                opacity: entrance,
                transform: `translateY(${(1 - entrance) * 105}%)`,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PointChips: React.FC<{
  points: readonly string[];
  accent: string;
}> = ({ points, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 11, marginTop: 36 }}>
      {points.map((point, index) => {
        const entrance = reveal(frame, fps, 31 + index * 7, 27);
        return (
          <div
            key={point}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "10px 16px",
              borderRadius: 999,
              border: `1px solid ${accent}42`,
              background: `${accent}11`,
              color: "rgba(238,242,255,0.84)",
              fontFamily: SANS,
              fontSize: 17,
              fontWeight: 500,
              opacity: entrance,
              transform: `translateY(${(1 - entrance) * 15}px) scale(${0.97 + entrance * 0.03})`,
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
  compact: boolean;
}> = ({ scene, compact }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kicker = reveal(frame, fps, 0, 30);
  const description = reveal(frame, fps, 21, 31);

  return (
    <div
      style={{
        width: compact ? 690 : 650,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          marginBottom: 23,
          color: scene.accentAlt,
          fontFamily: SANS,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 4.3,
          opacity: kicker,
        }}
      >
        <span
          style={{
            width: 42 * kicker,
            height: 2,
            background: scene.accentAlt,
            boxShadow: `0 0 16px ${scene.accentAlt}`,
          }}
        />
        {scene.kicker}
      </div>

      <AnimatedTitle title={scene.title} compact={compact} />

      <div
        style={{
          maxWidth: 620,
          marginTop: 27,
          color: "rgba(222,229,248,0.68)",
          fontFamily: SANS,
          fontSize: 23,
          lineHeight: 1.66,
          opacity: description,
          transform: `translateY(${(1 - description) * 17}px)`,
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
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const compact = scene.kind !== "feature";
  const windowDrift = Math.sin(frame / 48 + index) * 4;

  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <CinematicBackdrop
        accent={scene.accent}
        accentAlt={scene.accentAlt}
        progress={progress}
      />

      <div style={{ position: "absolute", left: 100, top: 67 }}>
        <HeaderBrand accent={scene.accent} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 98,
          top: compact ? 258 : 212,
          bottom: 170,
          display: "flex",
          alignItems: "center",
        }}
      >
        <CopyBlock scene={scene} compact={compact} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 760,
          top: compact ? 220 : 218,
          transform: `translateY(${windowDrift}px)`,
        }}
      >
        <AppMockup
          visual={scene.visual}
          accent={scene.accent}
          accentAlt={scene.accentAlt}
          progress={progress}
          releaseNotice={scene.releaseNotice}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 61,
          display: "flex",
          alignItems: "center",
          gap: 18,
          color: "rgba(222,230,255,0.43)",
          fontFamily: SANS,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 3,
        }}
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span style={{ color: "rgba(222,230,255,0.18)" }}>/</span>
        <span>{String(INTRO_SCENES.length).padStart(2, "0")}</span>
        <div
          style={{
            width: 280,
            height: 2,
            marginLeft: 9,
            background: "rgba(255,255,255,0.09)",
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
  const entrance = reveal(frame, fps, 4, 28);

  return (
    <div
      style={{
        position: "absolute",
        right: 54,
        bottom: 50,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "10px 16px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(3,6,15,0.62)",
        boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px)",
        color: "rgba(246,248,255,0.76)",
        fontFamily: SANS,
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: 0.7,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 9}px)`,
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

const transitionFor = (index: number) => {
  if (index % 4 === 1) {
    return slide({ direction: "from-right" });
  }
  if (index % 4 === 3) {
    return slide({ direction: "from-left" });
  }
  return fade();
};

export const FutureVideoIntro: React.FC<FutureVideoIntroProps> = ({
  watermark,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#050812" }}>
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
                presentation={transitionFor(index)}
                timing={springTiming({
                  config: { damping: 200 },
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
