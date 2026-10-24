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
import { blurSlide } from "@remotion/transitions/blur-slide";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { dreamyZoom } from "@remotion/transitions/dreamy-zoom";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { Audio } from "@remotion/media";

import { AppVisual } from "./AppMockup";
import type { FutureVideoIntroProps } from "./config";
import {
  INTRO_SCENES,
  TRANSITION_DURATION_IN_FRAMES,
  type IntroLayout,
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
  duration = 28,
): number =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 200, stiffness: 135, mass: 0.72 },
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
      borderRadius: size * 0.29,
      background: `linear-gradient(145deg, ${accent}, #6ce5e8)`,
      boxShadow: `0 0 40px ${accent}55`,
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
          background: "rgba(255,255,255,0.94)",
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

  return (
    <AbsoluteFill>
      {Array.from({ length: 32 }, (_, index) => {
        const baseX = random(`particle-x-${index}`) * 1920;
        const baseY = random(`particle-y-${index}`) * 1080;
        const speed = 0.2 + random(`particle-speed-${index}`) * 0.7;
        const size = 1.3 + random(`particle-size-${index}`) * 3.4;
        const drift =
          Math.sin(frame / (40 + index * 1.7) + index) * (8 + speed * 10);
        const lift = ((frame * speed + index * 41) % 180) - 90;
        const opacity =
          0.1 +
          Math.abs(Math.sin(frame / (48 + index * 2) + index * 0.8)) * 0.36;

        return (
          <span
            key={index}
            style={{
              position: "absolute",
              left: baseX + drift,
              top: baseY + lift,
              width: size,
              height: size,
              borderRadius: "50%",
              background: index % 3 === 0 ? accentAlt : accent,
              boxShadow: `0 0 ${size * 3.4}px ${index % 3 === 0 ? accentAlt : accent}`,
              opacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const wavePath = (
  frame: number,
  baseline: number,
  amplitude: number,
  phase: number,
): string => {
  const points = Array.from({ length: 65 }, (_, index) => {
    const x = (index / 64) * 1920;
    const y =
      baseline +
      Math.sin(index * 0.27 + frame / 22 + phase) * amplitude +
      Math.sin(index * 0.11 - frame / 37 + phase) * amplitude * 0.45;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return points.join(" ");
};

const WaveField: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();

  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, opacity: 0.55 }}
    >
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <path
          key={index}
          d={wavePath(frame, 620 + index * 44, 34 + index * 7, index * 0.62)}
          fill="none"
          stroke={index % 2 === 0 ? accent : accentAlt}
          strokeWidth={index === 3 ? 2.4 : 1.1}
          opacity={0.18 + index * 0.055}
        />
      ))}
    </svg>
  );
};

const PaletteField: React.FC = () => {
  const frame = useCurrentFrame();
  const colors = [
    "#7c9cff",
    "#ff8a5b",
    "#63d7a3",
    "#41d6d9",
    "#ff83b7",
    "#ffd166",
  ];

  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity: 0.34 }}>
      {colors.map((color, index) => {
        const wave = Math.sin(frame / 34 + index * 0.95);
        return (
          <div
            key={color}
            style={{
              position: "absolute",
              left: index * 340 - 160 + wave * 38,
              top: -180 + Math.abs(wave) * 100,
              width: 440,
              height: 1450,
              transform: `rotate(${-12 + index * 1.5}deg)`,
              background: `linear-gradient(to bottom, transparent, ${color}42, transparent)`,
              filter: "blur(8px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const SceneBackdrop: React.FC<{
  scene: IntroScene;
  progress: number;
}> = ({ scene, progress }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(progress, [0, 1], [-150, 150], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const pulse = 1 + Math.sin(frame / 60) * 0.055;
  const layoutGlow: Record<IntroLayout, { left: number; top: number }> = {
    hero: { left: 1060, top: -360 },
    canvas: { left: 660, top: -460 },
    cinema: { left: 1120, top: 300 },
    orbit: { left: 420, top: -220 },
    mosaic: { left: 980, top: -360 },
    wave: { left: 760, top: 500 },
    palette: { left: 1040, top: -250 },
    end: { left: 650, top: 120 },
  };
  const glow = layoutGlow[scene.layout];

  return (
    <AbsoluteFill style={{ backgroundColor: "#040711", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            "linear-gradient(rgba(124,156,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(124,156,255,0.1) 1px, transparent 1px)",
          backgroundSize: "74px 74px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 23%, black 78%, transparent 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 1180,
          height: 1180,
          left: glow.left + drift,
          top: glow.top,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${scene.accent}49 0%, ${scene.accentAlt}1e 38%, transparent 72%)`,
          filter: "blur(20px)",
          transform: `scale(${pulse})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          left: -430 - drift * 0.55,
          top: 560,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${scene.accentAlt}22 0%, transparent 70%)`,
          filter: "blur(25px)",
          transform: `scale(${2 - pulse})`,
        }}
      />

      {scene.layout === "wave" ? (
        <WaveField accent={scene.accent} accentAlt={scene.accentAlt} />
      ) : null}
      {scene.layout === "palette" ? <PaletteField /> : null}

      <Particles accent={scene.accent} accentAlt={scene.accentAlt} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            scene.layout === "cinema"
              ? "radial-gradient(circle at 50% 44%, transparent 25%, rgba(3,6,15,0.88) 100%)"
              : "linear-gradient(112deg, rgba(3,6,15,0.97) 0%, rgba(3,6,15,0.78) 38%, rgba(3,6,15,0.12) 72%, rgba(3,6,15,0.66) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const HeaderBrand: React.FC<{ accent: string }> = ({ accent }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
    <BrandGlyph size={44} accent={accent} />
    <div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 21,
          fontWeight: 700,
          color: "#f8f9ff",
        }}
      >
        FutureVideo
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: SANS,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 3.8,
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
  size?: number;
}> = ({ title, size = 72 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        color: "#f8f9ff",
        fontFamily: DISPLAY,
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.06,
        letterSpacing: -2.5,
        textShadow: "0 14px 48px rgba(0,0,0,0.42)",
      }}
    >
      {title.split("\n").map((line, index) => {
        const entrance = reveal(frame, fps, 7 + index * 5, 30);
        return (
          <div
            key={`${line}-${index}`}
            style={{ overflow: "hidden", paddingBottom: 4 }}
          >
            <div
              style={{
                opacity: entrance,
                transform: `translateY(${(1 - entrance) * 112}%)`,
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
  compact?: boolean;
}> = ({ points, accent, compact = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? 8 : 10,
        marginTop: compact ? 21 : 27,
      }}
    >
      {points.map((point, index) => {
        const entrance = reveal(frame, fps, 24 + index * 6, 24);
        return (
          <div
            key={point}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: compact ? "8px 12px" : "9px 14px",
              borderRadius: 999,
              border: `1px solid ${accent}40`,
              background: `${accent}10`,
              color: "rgba(239,243,255,0.82)",
              fontFamily: SANS,
              fontSize: compact ? 14 : 16,
              fontWeight: 500,
              opacity: entrance,
              transform: `translateY(${(1 - entrance) * 13}px) scale(${0.96 + entrance * 0.04})`,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: accent,
                boxShadow: `0 0 10px ${accent}`,
              }}
            />
            {point}
          </div>
        );
      })}
    </div>
  );
};

const Kicker: React.FC<{ scene: IntroScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = reveal(frame, fps, 0, 24);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        marginBottom: 18,
        color: scene.accentAlt,
        fontFamily: SANS,
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 4,
        opacity: entrance,
      }}
    >
      <span
        style={{
          width: 38 * entrance,
          height: 2,
          background: scene.accentAlt,
          boxShadow: `0 0 14px ${scene.accentAlt}`,
        }}
      />
      {scene.kicker}
    </div>
  );
};

const Description: React.FC<{
  text: string;
  width?: number;
  size?: number;
}> = ({ text, width = 590, size = 21 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = reveal(frame, fps, 15, 28);

  return (
    <div
      style={{
        width,
        marginTop: 19,
        color: "rgba(222,229,248,0.66)",
        fontFamily: SANS,
        fontSize: size,
        lineHeight: 1.58,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 14}px)`,
      }}
    >
      {text}
    </div>
  );
};

const CopyBlock: React.FC<{
  scene: IntroScene;
  size?: number;
  width?: number;
  showDescription?: boolean;
}> = ({ scene, size = 72, width = 620, showDescription = true }) => (
  <div style={{ width, display: "flex", flexDirection: "column" }}>
    <Kicker scene={scene} />
    <AnimatedTitle title={scene.title} size={size} />
    {showDescription ? (
      <Description text={scene.description} width={Math.min(width, 590)} />
    ) : null}
    <PointChips points={scene.points} accent={scene.accent} />
  </div>
);

const FloatingTag: React.FC<{
  label: string;
  value: string;
  accent: string;
  left: number;
  top: number;
  delay: number;
  align?: "left" | "right";
}> = ({ label, value, accent, left, top, delay, align = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = reveal(frame, fps, delay, 25);
  const bob = Math.sin((frame + delay * 5) / 28) * 3;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        minWidth: 190,
        padding: "13px 15px",
        borderRadius: 13,
        border: `1px solid ${accent}3d`,
        background: "rgba(7,12,25,0.78)",
        boxShadow: `0 18px 48px rgba(0,0,0,0.32), 0 0 30px ${accent}10`,
        backdropFilter: "blur(10px)",
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 18 + bob}px)`,
        textAlign: align,
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.8,
          color: `${accent}`,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontFamily: SANS,
          fontSize: 15,
          fontWeight: 600,
          color: "rgba(244,247,255,0.82)",
        }}
      >
        {value}
      </div>
    </div>
  );
};

const StageFrame: React.FC<{
  scene: IntroScene;
  progress: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotateY?: number;
  delay?: number;
}> = ({
  scene,
  progress,
  left,
  top,
  width,
  height,
  rotateY = -1.5,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = reveal(frame, fps, delay, 30);
  const float = Math.sin((frame + delay * 2) / 42) * 3;
  const camera = interpolate(progress, [0, 1], [1.018, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "absolute",
        left,
        top: top + float,
        width,
        height,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 34}px) perspective(1800px) rotateY(${rotateY}deg) scale(${camera})`,
        transformOrigin: "center",
        borderRadius: 26,
        border: "1px solid rgba(173,190,255,0.28)",
        background: "rgba(7,11,23,0.97)",
        boxShadow:
          "0 48px 120px rgba(0,0,0,0.6), 0 0 65px rgba(108,229,232,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          background: "rgba(13,18,34,0.98)",
          borderBottom: "1px solid rgba(170,190,255,0.13)",
        }}
      >
        {["#ff6b6b", "#ffd166", "#63d7a3"].map((color) => (
          <span
            key={color}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
        ))}
        <div
          style={{
            flex: 1,
            maxWidth: 460,
            height: 23,
            margin: "0 auto",
            borderRadius: 7,
            border: "1px solid rgba(170,190,255,0.12)",
            background: "rgba(255,255,255,0.025)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: SANS,
            fontSize: 8,
            letterSpacing: 1.2,
            color: "rgba(220,228,250,0.4)",
          }}
        >
          FutureVideo / {scene.kicker.toLowerCase()}
        </div>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 1.8,
            color: "rgba(220,228,250,0.25)",
          }}
        >
          ALPHA
        </span>
      </div>
      <div style={{ height: "calc(100% - 44px)" }}>
        <AppVisual
          visual={scene.visual}
          accent={scene.accent}
          accentAlt={scene.accentAlt}
          releaseNotice={scene.releaseNotice}
        />
      </div>
    </div>
  );
};

const HeroLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = reveal(frame, fps, 3, 26);
  const stageX = interpolate(progress, [0, 1], [22, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.sin),
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 94,
          top: 66,
          opacity: brand,
        }}
      >
        <HeaderBrand accent={scene.accent} />
      </div>
      <div style={{ position: "absolute", left: 94, top: 245 }}>
        <CopyBlock scene={scene} size={86} width={630} />
      </div>
      <div style={{ transform: `translateX(${stageX}px)` }}>
        <StageFrame
          scene={scene}
          progress={progress}
          left={755}
          top={218}
          width={1110}
          height={690}
          rotateY={-3.2}
          delay={4}
        />
      </div>
      <FloatingTag
        label="PRIVATE LIBRARY"
        value="无广告 · 无推荐流"
        accent={scene.accentAlt}
        left={1340}
        top={915}
        delay={23}
      />
    </>
  );
};

const CanvasLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = reveal(frame, fps, 2, 28);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 68,
          display: "flex",
          alignItems: "flex-end",
          gap: 40,
          opacity: titleIn,
        }}
      >
        <div>
          <Kicker scene={scene} />
          <AnimatedTitle title={scene.title} size={61} />
        </div>
        <Description
          text={scene.description}
          width={440}
          size={17}
        />
      </div>
      <StageFrame
        scene={scene}
        progress={progress}
        left={165}
        top={278}
        width={1590}
        height={760}
        rotateY={-0.8}
        delay={8}
      />
      <FloatingTag
        label="AUTO SCAN"
        value="12 部影片已整理"
        accent={scene.accentAlt}
        left={68}
        top={735}
        delay={24}
      />
      <FloatingTag
        label="SIDEBAR"
        value="悬停展开 · 移开收起"
        accent={scene.accent}
        left={1545}
        top={180}
        delay={30}
        align="right"
      />
    </>
  );
};

const CinemaLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = reveal(frame, fps, 9, 30);
  const zoom = interpolate(progress, [0, 1], [1.035, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <>
      <div style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
        <StageFrame
          scene={scene}
          progress={progress}
          left={65}
          top={70}
          width={1790}
          height={905}
          rotateY={0}
          delay={0}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 390,
          background:
            "linear-gradient(to top, rgba(3,6,15,0.98), rgba(3,6,15,0.7) 46%, transparent)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 112,
          opacity: titleIn,
        }}
      >
        <Kicker scene={scene} />
        <AnimatedTitle title={scene.title} size={91} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 95,
          bottom: 116,
          width: 560,
          textAlign: "right",
        }}
      >
        <Description text={scene.description} width={560} size={20} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PointChips
            points={scene.points}
            accent={scene.accentAlt}
            compact
          />
        </div>
      </div>
    </>
  );
};

const OrbitLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const orbit = frame / 58;

  return (
    <>
      <div style={{ position: "absolute", left: 94, top: 171 }}>
        <CopyBlock
          scene={scene}
          size={62}
          width={550}
          showDescription={false}
        />
      </div>
      <StageFrame
        scene={scene}
        progress={progress}
        left={670}
        top={190}
        width={1190}
        height={760}
        rotateY={1.2}
        delay={5}
      />
      {[
        ["快速收藏", "★", 0],
        ["夜晚", "01", 2.1],
        ["纪录片笔记", "02", 4.2],
      ].map(([label, icon, phase], index) => {
        const entrance = reveal(frame, fps, 20 + index * 7, 26);
        const y = Math.sin(orbit + Number(phase)) * 12;
        return (
          <div
            key={String(label)}
            style={{
              position: "absolute",
              left: 72 - index * 8,
              top: 460 + index * 105 + y,
              width: 250,
              height: 74,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 16px",
              borderRadius: 16,
              border: `1px solid ${scene.accent}3d`,
              background: "rgba(9,14,28,0.75)",
              boxShadow: `0 18px 45px rgba(0,0,0,0.32), 0 0 26px ${scene.accent}12`,
              opacity: entrance,
              transform: `translateX(${(1 - entrance) * -28}px) rotate(${index % 2 === 0 ? -1.5 : 1.3}deg)`,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9,
                color: scene.accentAlt,
                background: `${scene.accent}1d`,
                fontFamily: SANS,
                fontSize: 11,
              }}
            >
              {icon}
            </span>
            <span
              style={{
                fontFamily: SANS,
                fontSize: 14,
                fontWeight: 600,
                color: "rgba(243,246,255,0.82)",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
};

const MosaicLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  return (
    <>
      <div style={{ position: "absolute", left: 94, top: 250 }}>
        <CopyBlock scene={scene} size={58} width={520} />
      </div>
      <StageFrame
        scene={scene}
        progress={progress}
        left={650}
        top={235}
        width={1190}
        height={735}
        rotateY={-1.3}
        delay={6}
      />
      <FloatingTag
        label="CHAPTERS"
        value="章节跳转"
        accent={scene.accentAlt}
        left={1455}
        top={150}
        delay={16}
      />
      <FloatingTag
        label="TIMER"
        value="到点暂停 / 退出"
        accent={scene.accent}
        left={1450}
        top={755}
        delay={23}
      />
      <FloatingTag
        label="AB LOOP"
        value="A → B 区间循环"
        accent={scene.accentAlt}
        left={455}
        top={838}
        delay={30}
      />
    </>
  );
};

const WaveLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = reveal(frame, fps, 5, 28);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 142,
          width: 450,
          opacity: copy,
        }}
      >
        <Kicker scene={scene} />
        <AnimatedTitle title={scene.title} size={70} />
        <Description text={scene.description} width={430} size={18} />
        <PointChips
          points={scene.points}
          accent={scene.accentAlt}
          compact
        />
      </div>
      <StageFrame
        scene={scene}
        progress={progress}
        left={560}
        top={185}
        width={1280}
        height={760}
        rotateY={1.6}
        delay={7}
      />
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          bottom: 82,
          height: 2,
          background:
            "linear-gradient(90deg, transparent, rgba(108,229,232,0.7), rgba(124,156,255,0.3), transparent)",
          boxShadow: "0 0 20px rgba(108,229,232,0.45)",
        }}
      />
    </>
  );
};

const PaletteLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  return (
    <>
      <div style={{ position: "absolute", left: 100, top: 164 }}>
        <CopyBlock scene={scene} size={69} width={500} />
      </div>
      <StageFrame
        scene={scene}
        progress={progress}
        left={580}
        top={220}
        width={1260}
        height={730}
        rotateY={-2.2}
        delay={6}
      />
      <FloatingTag
        label="MOTION"
        value="完整 / 轻量 / 关闭"
        accent={scene.accentAlt}
        left={1515}
        top={834}
        delay={25}
      />
    </>
  );
};

const EndLayout: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = reveal(frame, fps, 3, 30);
  const titleIn = reveal(frame, fps, 12, 30);
  const noticeIn = reveal(frame, fps, 26, 28);
  const drift = Math.sin(progress * Math.PI) * 4;

  return (
    <>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 960 - (260 + index * 110) / 2,
            top: 380 - (260 + index * 110) / 2 + drift,
            width: 260 + index * 110,
            height: 260 + index * 110,
            borderRadius: "50%",
            border: `1px solid ${index % 2 === 0 ? scene.accent : scene.accentAlt}${index === 1 ? "36" : "20"}`,
            opacity: logoIn * (0.82 - index * 0.15),
            transform: `rotate(${frame * (index + 1) * 0.04}deg)`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 214,
          width: 760,
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: logoIn,
        }}
      >
        <BrandGlyph size={112} accent={scene.accent} />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 360,
          transform: "translateX(-50%)",
          width: 1050,
          textAlign: "center",
          opacity: titleIn,
        }}
      >
        <AnimatedTitle title={scene.title} size={88} />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 610,
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: noticeIn,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 22px",
            borderRadius: 999,
            border: `1px solid ${scene.accentAlt}5c`,
            background: `${scene.accentAlt}12`,
            boxShadow: `0 0 38px ${scene.accentAlt}18`,
            fontFamily: SANS,
            fontSize: 18,
            fontWeight: 600,
            color: "rgba(250,252,255,0.9)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: scene.accentAlt,
              boxShadow: `0 0 14px ${scene.accentAlt}`,
              transform: `scale(${0.9 + Math.sin(frame / 12) * 0.12})`,
            }}
          />
          {scene.releaseNotice}
        </div>
        <PointChips points={scene.points} accent={scene.accent} compact />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 105,
          transform: "translateX(-50%)",
          fontFamily: SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 4,
          color: "rgba(219,228,250,0.34)",
        }}
      >
        FUTUREVIDEO · PRIVATE · LOCAL
      </div>
    </>
  );
};

const SceneBody: React.FC<{ scene: IntroScene; progress: number }> = ({
  scene,
  progress,
}) => {
  switch (scene.layout) {
    case "hero":
      return <HeroLayout scene={scene} progress={progress} />;
    case "canvas":
      return <CanvasLayout scene={scene} progress={progress} />;
    case "cinema":
      return <CinemaLayout scene={scene} progress={progress} />;
    case "orbit":
      return <OrbitLayout scene={scene} progress={progress} />;
    case "mosaic":
      return <MosaicLayout scene={scene} progress={progress} />;
    case "wave":
      return <WaveLayout scene={scene} progress={progress} />;
    case "palette":
      return <PaletteLayout scene={scene} progress={progress} />;
    case "end":
      return <EndLayout scene={scene} progress={progress} />;
  }
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

  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <SceneBackdrop scene={scene} progress={progress} />
      <SceneBody scene={scene} progress={progress} />
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 59,
          display: "flex",
          alignItems: "center",
          gap: 16,
          color: "rgba(222,230,255,0.42)",
          fontFamily: SANS,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 2.8,
        }}
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span style={{ color: "rgba(222,230,255,0.17)" }}>/</span>
        <span>{String(INTRO_SCENES.length).padStart(2, "0")}</span>
        <div
          style={{
            width: 245,
            height: 2,
            marginLeft: 7,
            background: "rgba(255,255,255,0.08)",
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
  const entrance = reveal(frame, fps, 4, 24);

  return (
    <div
      style={{
        position: "absolute",
        right: 52,
        bottom: 47,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 15px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(3,6,15,0.62)",
        boxShadow: "0 12px 35px rgba(0,0,0,0.24)",
        backdropFilter: "blur(12px)",
        color: "rgba(246,248,255,0.76)",
        fontFamily: SANS,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: 0.7,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 8}px)`,
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
  if (index === 1) {
    return blurSlide({ direction: "from-right", blur: 18 });
  }
  if (index === 2) {
    return crossZoom({ strength: 0.72 });
  }
  if (index === 3) {
    return linearBlur({ intensity: 0.11 });
  }
  if (index === 4) {
    return blurSlide({ direction: "from-bottom", blur: 14 });
  }
  if (index === 5) {
    return crossZoom({ strength: 0.58 });
  }
  if (index === 6) {
    return blurSlide({ direction: "from-left", blur: 20 });
  }
  return dreamyZoom({ rotation: 3, scale: 1.08 });
};

export const FutureVideoIntro: React.FC<FutureVideoIntroProps> = ({
  watermark,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#040711" }}>
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
