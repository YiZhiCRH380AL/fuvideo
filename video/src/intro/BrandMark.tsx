import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

type BrandMarkProps = {
  size: number;
  accent: string;
  accentAlt?: string;
};

/**
 * Code-native recreation of src-tauri/icon.svg.
 *
 * The official mark is a play triangle split by a narrow seam. The two pieces
 * snap together after the title card lands, echoing the app's play/pause icon
 * morph without depending on a raster screenshot.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size,
  accent,
  accentAlt = "#6ce5e8",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settle = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 180, mass: 0.72 },
    durationInFrames: 24,
  });
  const seam = (1 - settle) * 32 + 5 + Math.sin(frame / 13) * 1.4;
  const sheen = interpolate(frame % 90, [0, 90], [-80, 125]);

  return (
    <div
      data-brand-mark="split-play"
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: size * 0.223,
        overflow: "hidden",
        background: "linear-gradient(180deg, #1c1c24, #0a0a0c)",
        boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.012)}px #34343e, 0 ${size * 0.08}px ${size * 0.3}px rgba(0,0,0,0.42), 0 0 ${size * 0.45}px ${accent}32`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 46%, ${accent}38, transparent 58%)`,
        }}
      />
      <svg
        viewBox="0 0 1024 1024"
        width={size}
        height={size}
        style={{ position: "relative", display: "block" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="futurevideo-mark-accent"
            x1="0.1"
            y1="0"
            x2="0.9"
            y2="1"
          >
            <stop offset="0%" stopColor={accentAlt} />
            <stop offset="100%" stopColor={accent} />
          </linearGradient>
          <linearGradient
            id="futurevideo-mark-sheen"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.28)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path
          d="M 378 296 L 506 399 L 506 625 L 378 728 Z"
          fill="url(#futurevideo-mark-accent)"
          transform={`translate(${-seam} 0)`}
        />
        <path
          d="M 530 418 L 646 512 L 530 606 Z"
          fill="url(#futurevideo-mark-accent)"
          transform={`translate(${seam} 0)`}
        />
        <path
          d="M 120 180 L 904 640 L 904 780 L 120 320 Z"
          fill="url(#futurevideo-mark-sheen)"
          opacity="0.42"
          transform={`translate(${sheen - 40} 0)`}
        />
      </svg>
    </div>
  );
};
