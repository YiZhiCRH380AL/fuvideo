import React from "react";
import {
  Easing,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { IntroVisual } from "./timeline";

const UI_FONT =
  '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const DISPLAY_FONT = '"Segoe UI", "Microsoft YaHei UI", sans-serif';

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
    config: { damping: 200, stiffness: 130, mass: 0.75 },
    durationInFrames: duration,
  });

const move = (
  frame: number,
  points: readonly { at: number; value: number }[],
  easing = Easing.inOut(Easing.cubic),
): number =>
  interpolate(
    frame,
    points.map((point) => point.at),
    points.map((point) => point.value),
    { ...clamp, easing },
  );

const fadeStyle = (progress: number, distance = 18): React.CSSProperties => ({
  opacity: progress,
  transform: `translateY(${(1 - progress) * distance}px)`,
});

const Cursor: React.FC<{
  x: number;
  y: number;
  opacity?: number;
  clickFrame?: number;
  label?: string;
}> = ({ x, y, opacity = 1, clickFrame, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clickDistance =
    clickFrame === undefined ? 99 : Math.abs(frame - clickFrame);
  const press = spring({
    frame: clickDistance < 10 ? 10 - clickDistance : 0,
    fps,
    config: { damping: 12, stiffness: 220 },
    durationInFrames: 12,
  });
  const ripple = Math.max(0, 1 - clickDistance / 12);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 100,
        opacity,
        transform: `scale(${1 - press * 0.13})`,
        transformOrigin: "2px 2px",
        pointerEvents: "none",
      }}
    >
      {ripple > 0 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: -27,
              top: -27,
              width: 54,
              height: 54,
              borderRadius: "50%",
              border: "2px solid rgba(108,229,232,0.9)",
              opacity: ripple,
              transform: `scale(${0.5 + ripple * 1.7})`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -17,
              top: -17,
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "rgba(108,229,232,0.2)",
              opacity: ripple * 0.8,
            }}
          />
        </>
      ) : null}
      <svg width="27" height="38" viewBox="0 0 27 38">
        <path
          d="M5.5 2.5v25.2l6.2-6.1 5.1 10.8 4.1-2-5.1-10.6h10.7L5.5 2.5Z"
          fill="#ffffff"
          stroke="#050811"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      {label === undefined ? null : (
        <div
          style={{
            position: "absolute",
            top: 39,
            left: 17,
            whiteSpace: "nowrap",
            padding: "7px 10px",
            borderRadius: 8,
            background: "rgba(5,8,17,0.92)",
            border: "1px solid rgba(255,255,255,0.16)",
            color: "rgba(255,255,255,0.7)",
            fontFamily: UI_FONT,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

const StatusDot: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 7,
}) => (
  <span
    style={{
      display: "inline-block",
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 10px ${color}`,
    }}
  />
);

const FolderIcon: React.FC<{ color: string; active?: boolean }> = ({
  color,
  active = false,
}) => (
  <span
    style={{
      position: "relative",
      display: "inline-block",
      width: 24,
      height: 18,
      borderRadius: 5,
      border: `1px solid ${active ? color : "rgba(160,180,255,0.34)"}`,
      background: active ? `${color}35` : "rgba(124,156,255,0.08)",
      boxShadow: active ? `0 0 16px ${color}38` : undefined,
    }}
  >
    <span
      style={{
        position: "absolute",
        left: 3,
        top: -4,
        width: 9,
        height: 5,
        borderRadius: "4px 4px 0 0",
        background: active ? color : "rgba(160,180,255,0.35)",
      }}
    />
  </span>
);

const Sidebar: React.FC<{
  frame: number;
  fps: number;
  accent: string;
  active?: string;
}> = ({ frame, fps, accent, active = "我的片库" }) => {
  const folders = ["电影收藏", "动画剧场", "纪录片", "周末放映"];

  return (
    <div
      style={{
        width: 210,
        flex: "0 0 210px",
        padding: "22px 15px",
        borderRight: "1px solid rgba(158,178,255,0.13)",
        background: "rgba(8,12,24,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "2px 6px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          marginBottom: 16,
        }}
      >
        <BrandGlyph size={30} accent={accent} />
        <div>
          <div
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: "#f2f5ff",
            }}
          >
            FutureVideo
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: UI_FONT,
              fontSize: 7,
              letterSpacing: 2.2,
              color: "rgba(208,220,255,0.42)",
            }}
          >
            PRIVATE SCREEN
          </div>
        </div>
      </div>

      {["首页", active].map((item, index) => {
        const itemIn = reveal(frame, fps, 8 + index * 5, 22);
        const selected = index === 1;
        return (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              height: 34,
              marginBottom: 5,
              padding: "0 9px",
              borderRadius: 9,
              border: selected
                ? `1px solid ${accent}50`
                : "1px solid transparent",
              background: selected ? `${accent}1d` : "transparent",
              color: selected ? "#eff3ff" : "rgba(211,220,245,0.48)",
              fontFamily: UI_FONT,
              fontSize: 11,
              fontWeight: selected ? 600 : 500,
              opacity: itemIn,
              transform: `translateX(${(1 - itemIn) * -12}px)`,
            }}
          >
            <StatusDot color={selected ? accent : "#7080a7"} size={5} />
            {item}
          </div>
        );
      })}

      <div
        style={{
          margin: "19px 9px 9px",
          color: "rgba(208,220,255,0.3)",
          fontFamily: UI_FONT,
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        FOLDERS
      </div>

      {folders.map((folder, index) => {
        const itemIn = reveal(frame, fps, 18 + index * 5, 24);
        return (
          <div
            key={folder}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 37,
              padding: "0 9px",
              borderRadius: 9,
              color: "rgba(224,231,250,0.62)",
              fontFamily: UI_FONT,
              fontSize: 10,
              opacity: itemIn,
              transform: `translateX(${(1 - itemIn) * -16}px)`,
            }}
          >
            <FolderIcon color={accent} active={index === 0} />
            {folder}
          </div>
        );
      })}
    </div>
  );
};

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
      boxShadow: `0 0 26px ${accent}55`,
      overflow: "hidden",
    }}
  >
    {[0.31, 0.5, 0.69].map((position, index) => (
      <span
        key={position}
        style={{
          position: "absolute",
          left: size * position,
          top: size * (index === 1 ? 0.25 : 0.34),
          width: size * 0.07,
          height: size * (index === 1 ? 0.5 : 0.32),
          borderRadius: 99,
          background: "rgba(255,255,255,0.9)",
        }}
      />
    ))}
  </div>
);

const WindowChrome: React.FC<{
  accent: string;
  path: string;
  compact?: boolean;
}> = ({ accent, path, compact = false }) => (
  <div
    style={{
      height: compact ? 42 : 50,
      display: "flex",
      alignItems: "center",
      gap: 13,
      padding: "0 18px",
      borderBottom: "1px solid rgba(170,190,255,0.14)",
      background: "rgba(14,19,36,0.96)",
    }}
  >
    <div style={{ display: "flex", gap: 7 }}>
      {["#ff6b6b", "#ffd166", "#63d7a3"].map((color) => (
        <StatusDot key={color} color={color} size={8} />
      ))}
    </div>
    <div
      style={{
        width: 25,
        height: 25,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 7,
        background: `${accent}18`,
        color: "rgba(229,236,255,0.55)",
        fontFamily: UI_FONT,
        fontSize: 12,
      }}
    >
      ‹
    </div>
    <div
      style={{
        flex: 1,
        maxWidth: 480,
        height: 25,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 7,
        border: "1px solid rgba(170,190,255,0.13)",
        background: "rgba(255,255,255,0.035)",
        color: "rgba(218,228,255,0.42)",
        fontFamily: UI_FONT,
        fontSize: 9,
        letterSpacing: 0.7,
      }}
    >
      <span style={{ fontSize: 8 }}>◇</span>
      {path}
    </div>
    <div
      style={{
        width: 70,
        color: "rgba(210,220,255,0.24)",
        fontFamily: UI_FONT,
        fontSize: 9,
        letterSpacing: 2,
        textAlign: "right",
      }}
    >
      0.3 ALPHA
    </div>
  </div>
);

const WindowShell: React.FC<{
  visual: IntroVisual;
  accent: string;
  progress: number;
  children: React.ReactNode;
}> = ({ visual, accent, progress, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entrance = reveal(frame, fps, 0, 34);
  const float = Math.sin(frame / 42) * 2.8;
  const rotateY = interpolate(progress, [0, 1], [-3.6, -0.8]);
  const rotateX = interpolate(progress, [0, 1], [2.1, 0.2]);
  const pathByVisual: Record<IntroVisual, string> = {
    launch: "FutureVideo / Home",
    library: "FutureVideo / Library",
    playback: "FutureVideo / Playback",
    collections: "FutureVideo / Collections",
    tools: "FutureVideo / Control Room",
    audio: "FutureVideo / Audio & Subtitles",
    themes: "FutureVideo / Appearance",
    release: "FutureVideo / Preview Release",
  };
  const scale = interpolate(entrance, [0, 1], [0.955, 1]);

  return (
    <div
      style={{
        width: 1110,
        height: 690,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 45 + float}px) perspective(1800px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`,
        transformOrigin: "center",
        borderRadius: 30,
        border: "1px solid rgba(173,190,255,0.3)",
        background: "rgba(7,11,23,0.97)",
        boxShadow:
          "0 55px 120px rgba(0,0,0,0.68), 0 0 70px rgba(108,229,232,0.08)",
        overflow: "hidden",
        position: "relative",
      }}
      data-window-ticks={Math.round(
        interpolate(frame, [0, durationInFrames], [0, 100], clamp),
      )}
    >
      <WindowChrome
        accent={accent}
        path={pathByVisual[visual]}
        compact={visual === "launch" || visual === "release"}
      />
      <div style={{ height: "calc(100% - 50px)", position: "relative" }}>
        {children}
      </div>
    </div>
  );
};

const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      borderRadius: 15,
      border: "1px solid rgba(167,187,255,0.16)",
      background:
        "linear-gradient(150deg, rgba(20,28,51,0.86), rgba(10,15,29,0.9))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      ...style,
    }}
  >
    {children}
  </div>
);

const VideoCard: React.FC<{
  title: string;
  meta: string;
  index: number;
  accent: string;
  accentAlt: string;
  frame: number;
  fps: number;
  delay: number;
  active?: boolean;
}> = ({
  title,
  meta,
  index,
  accent,
  accentAlt,
  frame,
  fps,
  delay,
  active = false,
}) => {
  const entry = reveal(frame, fps, delay, 27);
  const pulse = 0.82 + Math.sin((frame + index * 19) / 24) * 0.18;
  const lift = active ? 1 + Math.sin((frame - delay) / 18) * 0.008 : 1;

  return (
    <div
      style={{
        minWidth: 0,
        opacity: entry,
        transform: `translateY(${(1 - entry) * 25}px) scale(${lift})`,
      }}
    >
      <div
        style={{
          height: 126,
          borderRadius: 13,
          border: active
            ? `1px solid ${accent}90`
            : "1px solid rgba(167,187,255,0.15)",
          overflow: "hidden",
          background: "#10172a",
          boxShadow: active ? `0 0 28px ${accent}28` : undefined,
        }}
      >
        <div
          style={{
            height: 96,
            position: "relative",
            overflow: "hidden",
            background: `radial-gradient(circle at ${62 + index * 3}% 40%, ${accent}${index % 2 === 0 ? "66" : "45"} 0%, ${accentAlt}22 38%, rgba(7,11,23,0.2) 72%)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 10,
              top: 9,
              padding: "4px 6px",
              borderRadius: 5,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(3,6,15,0.52)",
              color: "rgba(255,255,255,0.55)",
              fontFamily: UI_FONT,
              fontSize: 7,
              letterSpacing: 1.2,
            }}
          >
            FU / {String(index + 1).padStart(2, "0")}
          </div>
          <div
            style={{
              position: "absolute",
              left: 14,
              bottom: 10,
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(4,8,18,0.38)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${pulse})`,
            }}
          >
            <span
              style={{
                width: 0,
                height: 0,
                marginLeft: 3,
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
                borderLeft: "8px solid rgba(255,255,255,0.86)",
              }}
            />
          </div>
        </div>
        <div
          style={{
            height: 30,
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            background: "rgba(9,14,27,0.94)",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: UI_FONT,
              fontSize: 9,
              fontWeight: 600,
              color: "rgba(235,240,255,0.8)",
            }}
          >
            {title}
          </span>
          <span
            style={{
              flex: "0 0 auto",
              fontFamily: UI_FONT,
              fontSize: 7,
              color: "rgba(208,220,255,0.35)",
            }}
          >
            {meta}
          </span>
        </div>
      </div>
    </div>
  );
};

const LaunchVisual: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hero = reveal(frame, fps, 8, 36);
  const sub = reveal(frame, fps, 20, 34);
  const button = reveal(frame, fps, 36, 30);
  const drift = Math.sin(frame / 35) * 8;

  return (
    <div style={{ height: "100%", display: "flex", padding: "46px 54px" }}>
      <div
        style={{
          width: "53%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: accentAlt,
            fontFamily: UI_FONT,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 3.6,
            opacity: sub,
          }}
        >
          YOUR PRIVATE CINEMA
        </div>
        <div
          style={{
            marginTop: 18,
            color: "#f8f9ff",
            fontFamily: DISPLAY_FONT,
            fontSize: 48,
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: -2.2,
            opacity: hero,
            transform: `translateY(${(1 - hero) * 26}px)`,
          }}
        >
          让每一帧
          <br />
          都有你的颜色。
        </div>
        <div
          style={{
            width: 370,
            marginTop: 18,
            fontFamily: UI_FONT,
            fontSize: 14,
            lineHeight: 1.75,
            color: "rgba(218,226,247,0.55)",
            opacity: sub,
          }}
        >
          选择一个目录，把里面的视频铺成方格。
          <br />
          没有广告，没有推荐，只留下真正想看的。
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 28,
            opacity: button,
            transform: `translateY(${(1 - button) * 12}px)`,
          }}
        >
          <div
            style={{
              padding: "11px 18px",
              borderRadius: 999,
              background: `linear-gradient(100deg, ${accent}, ${accentAlt})`,
              boxShadow: `0 10px 30px ${accent}38`,
              color: "#07101f",
              fontFamily: UI_FONT,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            选择目录 ↗
          </div>
          <div
            style={{
              padding: "11px 17px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.13)",
              color: "rgba(235,240,255,0.7)",
              fontFamily: UI_FONT,
              fontSize: 11,
            }}
          >
            查看示例视频
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {[0, 1, 2].map((index) => {
          const offset = (index - 1) * 34;
          const rotate = (index - 1) * 5.5;
          const cardIn = reveal(frame, fps, 22 + index * 5, 34);
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                width: 215,
                height: 330,
                borderRadius: 20,
                border: `1px solid ${index === 1 ? accent : "rgba(172,190,255,0.24)"}`,
                background:
                  index === 1
                    ? `linear-gradient(160deg, ${accent}55, rgba(14,24,42,0.96) 42%, rgba(8,12,23,0.98))`
                    : "linear-gradient(160deg, rgba(52,65,106,0.48), rgba(8,12,23,0.96))",
                boxShadow:
                  index === 1
                    ? `0 30px 70px rgba(0,0,0,0.5), 0 0 50px ${accent}28`
                    : "0 20px 45px rgba(0,0,0,0.42)",
                transform: `translateX(${offset + (index === 1 ? drift : drift * 0.25)}px) translateY(${(1 - cardIn) * 55}px) rotate(${rotate}deg) scale(${0.9 + cardIn * 0.1})`,
                opacity: cardIn,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 170,
                  background: `radial-gradient(circle at 55% 45%, ${accentAlt}62, transparent 62%)`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 22,
                  right: 22,
                  bottom: 34,
                  borderTop: "1px solid rgba(255,255,255,0.14)",
                  paddingTop: 14,
                  fontFamily: UI_FONT,
                  color: "rgba(245,247,255,0.9)",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {index === 1 ? "周末放映室" : index === 0 ? "电影收藏" : "动画剧场"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LibraryVisual: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const searchIn = reveal(frame, fps, 40, 30);
  const scan = interpolate(frame, [90, 260], [0, 1], clamp);
  const cursorX = move(frame, [
    { at: 60, value: 440 },
    { at: 160, value: 720 },
    { at: 250, value: 890 },
  ]);
  const cursorY = move(frame, [
    { at: 60, value: 510 },
    { at: 160, value: 330 },
    { at: 250, value: 360 },
  ]);
  const cards = [
    ["ep01 · 开场", "MKV"],
    ["ep02 · 夜航", "MP4"],
    ["ep03 · 重逢", "HEVC"],
    ["ep04 · 雨后", "MP4"],
    ["ep05 · 尾声", "MKV"],
    ["SP · 幕后", "WEBM"],
  ] as const;

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <Sidebar frame={frame} fps={fps} accent={accent} />
      <div style={{ flex: 1, padding: "25px 28px", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: UI_FONT,
                fontSize: 8,
                letterSpacing: 2.5,
                color: accentAlt,
              }}
            >
              LIBRARY
            </div>
            <div
              style={{
                marginTop: 5,
                fontFamily: DISPLAY_FONT,
                fontSize: 28,
                fontWeight: 700,
                color: "#f5f7ff",
              }}
            >
              我的片库
            </div>
          </div>
          <div
            style={{
              width: 260,
              height: 34,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              borderRadius: 9,
              border: "1px solid rgba(164,185,255,0.18)",
              background: "rgba(255,255,255,0.035)",
              ...fadeStyle(searchIn, 8),
            }}
          >
            <span style={{ color: accentAlt, fontSize: 14 }}>⌕</span>
            <span
              style={{
                fontFamily: UI_FONT,
                fontSize: 9,
                color: "rgba(222,230,250,0.4)",
              }}
            >
              按名字找 / 周末放映
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 19,
            fontFamily: UI_FONT,
            fontSize: 8,
            color: "rgba(209,220,247,0.36)",
          }}
        >
          <span>正在扫描目录</span>
          <div
            style={{
              flex: 1,
              height: 2,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${scan * 100}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${accent}, ${accentAlt})`,
              }}
            />
          </div>
          <span>{Math.round(scan * 12)} / 12</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 15,
            marginTop: 17,
          }}
        >
          {cards.map(([title, meta], index) => (
            <VideoCard
              key={title}
              title={title}
              meta={meta}
              index={index}
              accent={accent}
              accentAlt={accentAlt}
              frame={frame}
              fps={fps}
              delay={65 + index * 7}
              active={index === 4}
            />
          ))}
        </div>
      </div>
      <Cursor
        x={cursorX}
        y={cursorY}
        opacity={interpolate(frame, [45, 65], [0, 1], clamp)}
        clickFrame={242}
      />
    </div>
  );
};

const PlaybackVisual: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const playerIn = reveal(frame, fps, 15, 30);
  const progress = interpolate(frame, [65, 290], [0.16, 0.68], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const previewIn = spring({
    frame: Math.max(0, frame - 115),
    fps,
    config: { damping: 200, stiffness: 140 },
    durationInFrames: 25,
  });
  const preciseIn = spring({
    frame: Math.max(0, frame - 195),
    fps,
    config: { damping: 200, stiffness: 150 },
    durationInFrames: 24,
  });
  const ripple = interpolate(frame, [236, 250], [0, 1], clamp);
  const cursorX = move(frame, [
    { at: 55, value: 610 },
    { at: 135, value: 500 },
    { at: 230, value: 420 },
  ]);
  const cursorY = move(frame, [
    { at: 55, value: 520 },
    { at: 135, value: 445 },
    { at: 230, value: 465 },
  ]);

  return (
    <div
      style={{
        height: "100%",
        padding: "24px 28px 92px",
        opacity: playerIn,
        background:
          "radial-gradient(circle at 55% 40%, rgba(108,229,232,0.06), transparent 45%)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
          background:
            "linear-gradient(130deg, #03050b 0%, #0b1220 45%, #141b2f 100%)",
          border: "1px solid rgba(165,185,255,0.12)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 64% 44%, ${accentAlt}30, transparent 26%), radial-gradient(circle at 39% 64%, ${accent}24, transparent 34%)`,
            transform: `scale(${1.03 + Math.sin(frame / 80) * 0.012})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "45%",
            width: 92,
            height: 92,
            margin: "-46px 0 0 -46px",
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.28)",
            background: "rgba(4,8,18,0.34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${1 - ripple * 0.18})`,
          }}
        >
          <span
            style={{
              width: 0,
              height: 0,
              marginLeft: 7,
              borderTop: "13px solid transparent",
              borderBottom: "13px solid transparent",
              borderLeft: `19px solid ${accentAlt}`,
              filter: `drop-shadow(0 0 12px ${accentAlt})`,
            }}
          />
        </div>

        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: "50%",
              top: "45%",
              width: 92,
              height: 92,
              margin: "-46px 0 0 -46px",
              borderRadius: "50%",
              border: `1px solid ${accentAlt}`,
              opacity: ripple * (1 - index * 0.22),
              transform: `scale(${1 + (ripple * (1.4 + index * 0.5))})`,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            left: 24,
            top: 20,
            padding: "7px 10px",
            borderRadius: 8,
            background: "rgba(4,8,18,0.48)",
            border: "1px solid rgba(255,255,255,0.09)",
            fontFamily: UI_FONT,
            color: "rgba(235,240,255,0.58)",
            fontSize: 9,
            letterSpacing: 1.5,
          }}
        >
          FU / 05 · 夜航
        </div>

        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 110,
            width: 172,
            height: 102,
            marginLeft: -86,
            opacity: previewIn,
            transform: `translateY(${(1 - previewIn) * 22}px) scale(${0.92 + previewIn * 0.08})`,
            borderRadius: 13,
            overflow: "hidden",
            border: preciseIn > 0.65
              ? `1px solid ${accentAlt}`
              : "1px solid rgba(255,255,255,0.12)",
            background:
              "linear-gradient(135deg, rgba(124,156,255,0.45), rgba(4,8,18,0.94))",
            boxShadow: "0 18px 38px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at 64% 40%, ${accentAlt}62, transparent 56%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 9,
              fontFamily: UI_FONT,
              fontSize: 15,
              fontWeight: 700,
              color: "#f4f7ff",
            }}
          >
            58s
          </div>
          <div
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              padding: "4px 6px",
              borderRadius: 5,
              background: "rgba(4,8,18,0.62)",
              fontFamily: UI_FONT,
              fontSize: 7,
              color: preciseIn > 0.65 ? accentAlt : "rgba(255,255,255,0.42)",
            }}
          >
            {preciseIn > 0.65 ? "精确帧" : "近似缩略图"}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 52,
          right: 52,
          bottom: 24,
          height: 60,
          display: "flex",
          alignItems: "center",
          gap: 13,
          padding: "0 18px",
          borderRadius: 17,
          border: "1px solid rgba(165,185,255,0.16)",
          background: "rgba(9,14,28,0.9)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.42)",
        }}
      >
        <span style={{ color: accentAlt, fontSize: 14 }}>Ⅱ</span>
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>◀◀</span>
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>▶</span>
        <span
          style={{
            marginLeft: 7,
            fontFamily: UI_FONT,
            fontSize: 10,
            color: "rgba(235,241,255,0.72)",
          }}
        >
          ep05·夜航.mkv
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: UI_FONT,
            fontSize: 8,
            color: "rgba(220,229,250,0.44)",
          }}
        >
          {Math.floor(progress * 140)}s / 140s
        </span>
        <span style={{ color: "rgba(235,241,255,0.55)", fontSize: 12 }}>◖</span>
        <span
          style={{
            padding: "5px 7px",
            borderRadius: 5,
            background: "rgba(255,255,255,0.06)",
            fontFamily: UI_FONT,
            fontSize: 8,
            color: "rgba(235,241,255,0.64)",
          }}
        >
          1x
        </span>
        <span style={{ color: "rgba(235,241,255,0.46)", fontSize: 11 }}>⛶</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 78,
          right: 78,
          bottom: 18,
          height: 3,
          borderRadius: 99,
          background: "rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 99,
            background: `linear-gradient(90deg, ${accent}, ${accentAlt})`,
            boxShadow: `0 0 12px ${accentAlt}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `calc(${progress * 100}% - 5px)`,
            top: -4,
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: accentAlt,
            boxShadow: `0 0 16px ${accentAlt}`,
          }}
        />
      </div>
      <Cursor
        x={cursorX}
        y={cursorY}
        opacity={interpolate(frame, [48, 62], [0, 1], clamp)}
        clickFrame={232}
        label="拖动预览"
      />
    </div>
  );
};

const CollectionsVisual: React.FC<{
  accent: string;
  accentAlt: string;
}> = ({ accent, accentAlt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drawer = spring({
    frame: Math.max(0, frame - 65),
    fps,
    config: { damping: 200, stiffness: 120 },
    durationInFrames: 32,
  });
  const cursorX = move(frame, [
    { at: 50, value: 760 },
    { at: 120, value: 610 },
    { at: 190, value: 610 },
  ]);
  const cursorY = move(frame, [
    { at: 50, value: 360 },
    { at: 120, value: 230 },
    { at: 190, value: 310 },
  ]);
  const selections = [85, 150, 205];

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <SidebarFrame
        accent={accent}
        frame={frame}
        fps={fps}
        active="收藏夹"
      />
      <div style={{ flex: 1, padding: "24px 27px", position: "relative" }}>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 25,
            fontWeight: 700,
            color: "#f5f7ff",
          }}
        >
          全部影片
        </div>
        <div
          style={{
            marginTop: 17,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          {["夜航", "周末放映", "海边日记", "幕后特辑", "另一种结局", "春日片段"].map(
            (title, index) => (
              <VideoCard
                key={title}
                title={title}
                meta={index % 2 === 0 ? "MP4" : "MKV"}
                index={index}
                accent={accent}
                accentAlt={accentAlt}
                frame={frame}
                fps={fps}
                delay={20 + index * 5}
                active={index === 2}
              />
            ),
          )}
        </div>

        <div
          style={{
            position: "absolute",
            right: 28,
            top: 20,
            width: 360,
            padding: 16,
            borderRadius: 17,
            border: `1px solid ${accent}48`,
            background: "rgba(7,12,25,0.97)",
            boxShadow: `0 25px 70px rgba(0,0,0,0.55), 0 0 40px ${accent}14`,
            opacity: drawer,
            transform: `translateX(${(1 - drawer) * 240}px) scale(${0.96 + drawer * 0.04})`,
          }}
        >
          <div
            style={{
              fontFamily: UI_FONT,
              fontSize: 8,
              letterSpacing: 2,
              color: accentAlt,
            }}
          >
            SAVE TO
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: UI_FONT,
              fontSize: 15,
              fontWeight: 700,
              color: "#f5f7ff",
            }}
          >
            海边日记
          </div>
          <div
            style={{
              marginTop: 3,
              marginBottom: 13,
              fontFamily: UI_FONT,
              fontSize: 9,
              color: "rgba(215,224,248,0.4)",
            }}
          >
            选择一个或多个收藏夹
          </div>
          {[
            ["快速收藏", "★"],
            ["夜晚", "01"],
            ["纪录片笔记", "02"],
          ].map(([label, icon], index) => {
            const selected = spring({
              frame: Math.max(0, frame - selections[index]!),
              fps,
              config: { damping: 200, stiffness: 180 },
              durationInFrames: 20,
            });
            return (
              <div
                key={label}
                style={{
                  height: 42,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 7,
                  padding: "0 11px",
                  borderRadius: 10,
                  border:
                    selected > 0.4
                      ? `1px solid ${accentAlt}85`
                      : "1px solid rgba(255,255,255,0.08)",
                  background:
                    selected > 0.4
                      ? `${accentAlt}16`
                      : "rgba(255,255,255,0.025)",
                  fontFamily: UI_FONT,
                  fontSize: 10,
                  color:
                    selected > 0.4
                      ? "rgba(244,247,255,0.88)"
                      : "rgba(220,228,248,0.54)",
                }}
              >
                <span
                  style={{
                    width: 25,
                    height: 25,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 7,
                    background:
                      selected > 0.4 ? `${accentAlt}24` : "rgba(255,255,255,0.05)",
                    color: selected > 0.4 ? accentAlt : "rgba(255,255,255,0.32)",
                    fontSize: 9,
                  }}
                >
                  {icon}
                </span>
                {label}
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    border: `1px solid ${selected > 0.4 ? accentAlt : "rgba(255,255,255,0.18)"}`,
                    background: selected > 0.4 ? accentAlt : "transparent",
                    color: "#07101f",
                    fontSize: 10,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: selected,
                  }}
                >
                  ✓
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <Cursor
        x={cursorX}
        y={cursorY}
        opacity={interpolate(frame, [45, 60], [0, 1], clamp)}
        clickFrame={195}
      />
    </div>
  );
};

const SidebarFrame: React.FC<{
  accent: string;
  frame: number;
  fps: number;
  active: string;
}> = ({ accent, frame, fps, active }) => (
  <div
    style={{
      width: 200,
      flex: "0 0 200px",
      padding: "23px 14px",
      borderRight: "1px solid rgba(158,178,255,0.13)",
      background: "rgba(8,12,24,0.72)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 20 }}>
      <BrandGlyph size={29} accent={accent} />
      <div
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 12,
          fontWeight: 700,
          color: "#f4f7ff",
        }}
      >
        FutureVideo
      </div>
    </div>
    {["播放列表", "收藏夹", "播放工具", "外观", "设置"].map((item, index) => {
      const itemIn = reveal(frame, fps, 8 + index * 4, 22);
      const selected = item === active;
      return (
        <div
          key={item}
          style={{
            height: 34,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "0 9px",
            marginBottom: 5,
            borderRadius: 9,
            background: selected ? `${accent}1d` : "transparent",
            border: selected
              ? `1px solid ${accent}45`
              : "1px solid transparent",
            color: selected ? "#f0f4ff" : "rgba(213,222,246,0.46)",
            fontFamily: UI_FONT,
            fontSize: 10,
            opacity: itemIn,
            transform: `translateX(${(1 - itemIn) * -12}px)`,
          }}
        >
          <StatusDot color={selected ? accent : "#6e7ca2"} size={5} />
          {item}
        </div>
      );
    })}
  </div>
);

const ToolsVisual: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const aPoint = reveal(frame, fps, 110, 22);
  const bPoint = reveal(frame, fps, 180, 22);
  const loopFill = interpolate(frame, [150, 250], [0.17, 0.64], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const timer = interpolate(frame, [80, 300], [0, 0.72], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const cursorX = move(frame, [
    { at: 60, value: 660 },
    { at: 110, value: 405 },
    { at: 180, value: 530 },
    { at: 260, value: 860 },
  ]);
  const cursorY = move(frame, [
    { at: 60, value: 330 },
    { at: 110, value: 280 },
    { at: 180, value: 280 },
    { at: 260, value: 480 },
  ]);

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <SidebarFrame
        accent={accent}
        frame={frame}
        fps={fps}
        active="播放工具"
      />
      <div style={{ flex: 1, padding: "23px 27px" }}>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 25,
            fontWeight: 700,
            color: "#f5f7ff",
          }}
        >
          播放工具
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: UI_FONT,
            fontSize: 9,
            color: "rgba(215,224,248,0.38)",
          }}
        >
          CHAPTERS · BOOKMARKS · AB LOOP · TIMER
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 13,
            marginTop: 16,
          }}
        >
          <GlassCard style={{ padding: 14, height: 188 }}>
            <CardHeading label="章节" accent={accentAlt} />
            {[
              ["00:00", "开场"],
              ["01:05", "正片"],
              ["01:31", "尾声"],
            ].map(([time, title], index) => {
              const itemIn = reveal(frame, fps, 30 + index * 6, 22);
              return (
                <div
                  key={title}
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "0 8px",
                    borderBottom: "1px solid rgba(255,255,255,0.055)",
                    opacity: itemIn,
                    transform: `translateX(${(1 - itemIn) * 10}px)`,
                    fontFamily: UI_FONT,
                    fontSize: 9,
                  }}
                >
                  <span style={{ color: accentAlt }}>{time}</span>
                  <span style={{ color: "rgba(231,237,253,0.65)" }}>{title}</span>
                </div>
              );
            })}
          </GlassCard>

          <GlassCard style={{ padding: 14, height: 188 }}>
            <CardHeading label="定时关闭" accent={accentAlt} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 22,
                paddingTop: 8,
              }}
            >
              <div
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: `conic-gradient(${accentAlt} ${timer * 360}deg, rgba(255,255,255,0.07) 0deg)`,
                  padding: 6,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: "#0b1020",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: UI_FONT,
                  }}
                >
                  <span
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#eff3ff",
                    }}
                  >
                    {Math.round(30 - timer * 21)}
                  </span>
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.36)" }}>
                    MIN
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", width: 145, gap: 6 }}>
                {["15", "30", "45", "60"].map((minute, index) => (
                  <span
                    key={minute}
                    style={{
                      width: 42,
                      padding: "7px 0",
                      borderRadius: 99,
                      textAlign: "center",
                      background:
                        index === 1 ? `${accent}24` : "rgba(255,255,255,0.04)",
                      border:
                        index === 1
                          ? `1px solid ${accent}55`
                          : "1px solid rgba(255,255,255,0.06)",
                      fontFamily: UI_FONT,
                      fontSize: 8,
                      color:
                        index === 1
                          ? "#eef3ff"
                          : "rgba(216,225,247,0.42)",
                    }}
                  >
                    {minute}m
                  </span>
                ))}
              </div>
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 14, height: 198 }}>
            <CardHeading label="AB 循环" accent={accentAlt} />
            <div
              style={{
                position: "relative",
                height: 22,
                margin: "22px 8px 18px",
                borderRadius: 99,
                background: "rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "17%",
                  width: `${loopFill * 73}%`,
                  top: 0,
                  bottom: 0,
                  borderRadius: 99,
                  background: `linear-gradient(90deg, ${accent}70, ${accentAlt})`,
                  boxShadow: `0 0 20px ${accentAlt}35`,
                }}
              />
              {[
                { left: "17%", label: "A", progress: aPoint },
                { left: "64%", label: "B", progress: bPoint },
              ].map((point) => (
                <div
                  key={point.label}
                  style={{
                    position: "absolute",
                    left: point.left,
                    top: -9,
                    width: 40,
                    height: 40,
                    marginLeft: -20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: `2px solid ${accentAlt}`,
                    background: "#0a1020",
                    color: "#f4f7ff",
                    fontFamily: UI_FONT,
                    fontSize: 10,
                    fontWeight: 700,
                    opacity: point.progress,
                    transform: `scale(${0.6 + point.progress * 0.4})`,
                  }}
                >
                  {point.label}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 7,
                fontFamily: UI_FONT,
                fontSize: 8,
                color: "rgba(220,228,248,0.5)",
              }}
            >
              {["设 A（当前位置）", "设 B（当前位置）", "清除"].map(
                (label, index) => (
                  <span
                    key={label}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${index === 0 && aPoint > 0.5 ? `${accentAlt}70` : "rgba(255,255,255,0.09)"}`,
                      background:
                        index === 0 && aPoint > 0.5
                          ? `${accentAlt}16`
                          : "rgba(255,255,255,0.025)",
                    }}
                  >
                    {label}
                  </span>
                ),
              )}
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 14, height: 198 }}>
            <CardHeading label="窗口" accent={accentAlt} />
            {[
              ["窗口置顶", true],
              ["迷你模式", false],
            ].map(([label], index) => {
              const toggle = index === 0 ? reveal(frame, fps, 90, 25) : 0;
              return (
                <div
                  key={String(label)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 39,
                    fontFamily: UI_FONT,
                    fontSize: 9,
                    color: "rgba(221,229,249,0.58)",
                  }}
                >
                  <div
                    style={{
                      width: 27,
                      height: 15,
                      padding: 2,
                      borderRadius: 99,
                      background:
                        index === 0 && toggle > 0.4
                          ? accent
                          : "rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: "#f4f7ff",
                        transform: `translateX(${index === 0 ? toggle * 12 : 0}px)`,
                      }}
                    />
                  </div>
                  {label}
                </div>
              );
            })}
            <div
              style={{
                marginTop: 7,
                padding: "9px 10px",
                borderRadius: 8,
                border: `1px solid ${accentAlt}28`,
                fontFamily: UI_FONT,
                fontSize: 8,
                color: "rgba(220,228,248,0.38)",
              }}
            >
              T · 缩小成一小块，只看画面
            </div>
          </GlassCard>
        </div>
      </div>
      <Cursor
        x={cursorX}
        y={cursorY}
        opacity={interpolate(frame, [55, 70], [0, 1], clamp)}
        clickFrame={180}
      />
    </div>
  );
};

const CardHeading: React.FC<{ label: string; accent: string }> = ({
  label,
  accent,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      fontFamily: UI_FONT,
      fontSize: 11,
      fontWeight: 700,
      color: "rgba(239,243,255,0.86)",
    }}
  >
    <StatusDot color={accent} size={5} />
    {label}
  </div>
);

const SpectrumBars: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = Array.from({ length: 20 }, (_, index) => {
    const phase = index * 0.67;
    const energy =
      0.22 +
      Math.abs(Math.sin(frame / 18 + phase)) * (0.32 + (index % 7) * 0.06);
    const entrance = reveal(frame, fps, 55 + index * 2, 22);
    return energy * entrance;
  });

  return (
    <div
      style={{
        height: 118,
        display: "flex",
        alignItems: "flex-end",
        gap: 5,
        padding: "0 12px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {bars.map((height, index) => (
        <div
          key={index}
          style={{
            flex: 1,
            height: `${Math.max(8, height * 100)}%`,
            borderRadius: "6px 6px 2px 2px",
            background: `linear-gradient(to top, ${accent}, ${accentAlt})`,
            boxShadow: `0 0 18px ${accentAlt}20`,
          }}
        />
      ))}
    </div>
  );
};

const AudioVisual: React.FC<{ accent: string; accentAlt: string }> = ({
  accent,
  accentAlt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const subtitleOne = interpolate(frame, [155, 175], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const subtitleTwo = interpolate(frame, [205, 225], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const cursorX = move(frame, [
    { at: 50, value: 680 },
    { at: 115, value: 310 },
    { at: 230, value: 720 },
  ]);
  const cursorY = move(frame, [
    { at: 50, value: 400 },
    { at: 115, value: 155 },
    { at: 230, value: 460 },
  ]);

  return (
    <div style={{ height: "100%", display: "flex" }}>
      <SidebarFrame accent={accent} frame={frame} fps={fps} active="设置" />
      <div style={{ flex: 1, padding: "23px 27px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: 25,
                fontWeight: 700,
                color: "#f5f7ff",
              }}
            >
              音轨与字幕
            </div>
            <div
              style={{
                marginTop: 3,
                fontFamily: UI_FONT,
                fontSize: 9,
                color: "rgba(215,224,248,0.38)",
              }}
            >
              AUDIO OUTPUT · TRACKS · SUBTITLES
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: 4,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {["音频", "字幕"].map((tab, index) => (
              <span
                key={tab}
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  background:
                    index === 0 ? `${accent}20` : "transparent",
                  border:
                    index === 0
                      ? `1px solid ${accent}42`
                      : "1px solid transparent",
                  fontFamily: UI_FONT,
                  fontSize: 9,
                  color:
                    index === 0
                      ? "rgba(245,248,255,0.88)"
                      : "rgba(220,228,248,0.4)",
                }}
              >
                {tab}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "0.86fr 1.14fr",
            gap: 13,
            marginTop: 17,
          }}
        >
          <GlassCard style={{ padding: 13, height: 326 }}>
            <CardHeading label="音轨" accent={accentAlt} />
            {["日语 · 主音轨", "中文 · 次音轨", "评论音轨"].map(
              (track, index) => {
                const itemIn = reveal(frame, fps, 32 + index * 7, 24);
                const selected = index === (frame > 120 ? 1 : 0);
                return (
                  <div
                    key={track}
                    style={{
                      height: 43,
                      marginTop: 8,
                      padding: "0 11px",
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      borderRadius: 9,
                      border: selected
                        ? `1px solid ${accentAlt}72`
                        : "1px solid rgba(255,255,255,0.07)",
                      background: selected
                        ? `${accentAlt}12`
                        : "rgba(255,255,255,0.02)",
                      opacity: itemIn,
                      transform: `translateX(${(1 - itemIn) * 12}px)`,
                      fontFamily: UI_FONT,
                      fontSize: 9,
                      color: selected
                        ? "rgba(245,248,255,0.86)"
                        : "rgba(218,226,247,0.47)",
                    }}
                  >
                    <StatusDot
                      color={selected ? accentAlt : "#7180a7"}
                      size={5}
                    />
                    {track}
                    <span style={{ flex: 1 }} />
                    {selected ? (
                      <span style={{ color: accentAlt, fontSize: 9 }}>●</span>
                    ) : null}
                  </div>
                );
              },
            )}
            <div
              style={{
                marginTop: 18,
                fontFamily: UI_FONT,
                fontSize: 8,
                color: "rgba(218,226,247,0.32)",
                letterSpacing: 1.2,
              }}
            >
              OUTPUT DEVICE
            </div>
            <div
              style={{
                marginTop: 8,
                height: 39,
                padding: "0 11px",
                display: "flex",
                alignItems: "center",
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: UI_FONT,
                fontSize: 9,
                color: "rgba(231,237,253,0.55)",
              }}
            >
              Windows WASAPI · 扬声器
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 13, height: 326 }}>
            <div
              style={{
                height: 155,
                position: "relative",
                borderRadius: 11,
                overflow: "hidden",
                background:
                  "linear-gradient(135deg, rgba(11,17,31,0.98), rgba(20,29,51,0.96))",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(circle at 62% 42%, ${accentAlt}2f, transparent 42%)`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 15,
                  bottom: 46,
                  fontFamily: UI_FONT,
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.55,
                  color: "#f7f9ff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  opacity: subtitleOne,
                  transform: `translateY(${(1 - subtitleOne) * 9}px)`,
                }}
              >
                那一天的风景，还留在镜头里。
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 15,
                  bottom: 18,
                  fontFamily: UI_FONT,
                  fontSize: 10,
                  color: accentAlt,
                  opacity: subtitleTwo,
                  transform: `translateY(${(1 - subtitleTwo) * 8}px)`,
                }}
              >
                The scenery from that day still lives in every frame.
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 12,
                fontFamily: UI_FONT,
                fontSize: 9,
                color: "rgba(222,230,249,0.5)",
              }}
            >
              <span>10 段实时频谱</span>
              <span style={{ color: accentAlt }}>高级 · 音乐</span>
            </div>
            <SpectrumBars accent={accent} accentAlt={accentAlt} />
          </GlassCard>
        </div>
      </div>
      <Cursor
        x={cursorX}
        y={cursorY}
        opacity={interpolate(frame, [48, 65], [0, 1], clamp)}
        clickFrame={120}
        label="切换音轨"
      />
    </div>
  );
};

const THEME_COLORS = [
  ["#7c9cff", "#6ce5e8"],
  ["#ff8a5b", "#ffd166"],
  ["#63d7a3", "#d3f26a"],
  ["#41d6d9", "#77a7ff"],
  ["#ff83b7", "#b79cff"],
  ["#b4482e", "#2a7f77"],
] as const;

const ThemesVisual: React.FC<{ accent: string; accentAlt: string }> = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const cycle = interpolate(frame, [70, durationInFrames - 50], [0, 5], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const activeIndex = Math.min(5, Math.round(cycle));
  const currentColor = interpolateColors(
    cycle,
    [0, 1, 2, 3, 4, 5],
    THEME_COLORS.map((colors) => colors[0]),
  );
  const currentAlt = interpolateColors(
    cycle,
    [0, 1, 2, 3, 4, 5],
    THEME_COLORS.map((colors) => colors[1]),
  );
  const cursorX = move(frame, [
    { at: 40, value: 330 },
    { at: 160, value: 610 },
    { at: 300, value: 820 },
  ]);
  const cursorY = move(frame, [
    { at: 40, value: 410 },
    { at: 160, value: 180 },
    { at: 300, value: 220 },
  ]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        background: `radial-gradient(circle at 66% 38%, ${currentColor}24, transparent 42%)`,
      }}
    >
      <SidebarFrame
        accent={currentColor}
        frame={frame}
        fps={fps}
        active="外观"
      />
      <div style={{ flex: 1, padding: "23px 27px" }}>
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 25,
            fontWeight: 700,
            color: "#f5f7ff",
          }}
        >
          给今晚换一种颜色
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: UI_FONT,
            fontSize: 9,
            color: "rgba(215,224,248,0.38)",
          }}
        >
          APPEARANCE · SIX THEMES · THREE MOTION MODES
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 17,
            padding: 11,
            borderRadius: 13,
            border: `1px solid ${currentColor}35`,
            background: "rgba(255,255,255,0.025)",
          }}
        >
          {THEME_COLORS.map(([color, alt], index) => {
            const entry = reveal(frame, fps, 20 + index * 5, 24);
            const isActive = index === activeIndex;
            return (
              <div
                key={color}
                style={{
                  flex: 1,
                  height: 46,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 9px",
                  borderRadius: 9,
                  border: isActive
                    ? `1px solid ${color}98`
                    : `1px solid ${color}25`,
                  background: isActive ? `${color}1c` : "rgba(255,255,255,0.02)",
                  opacity: entry,
                  transform: `translateY(${(1 - entry) * 12}px) scale(${isActive ? 1.03 : 1})`,
                  boxShadow: isActive ? `0 0 20px ${color}28` : undefined,
                }}
              >
                <div
                  style={{
                    width: 19,
                    height: 19,
                    borderRadius: 6,
                    background: `linear-gradient(145deg, ${color}, ${alt})`,
                    boxShadow: `0 0 10px ${color}5e`,
                  }}
                />
                <span
                  style={{
                    fontFamily: UI_FONT,
                    fontSize: 8,
                    color: isActive
                      ? "rgba(247,249,255,0.9)"
                      : "rgba(222,230,249,0.44)",
                  }}
                >
                  {["极夜", "余烬", "苔原", "潮汐", "莓果", "日光"][index]}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.22fr 0.78fr",
            gap: 13,
            marginTop: 14,
          }}
        >
          <GlassCard
            style={{
              padding: 14,
              height: 284,
              background: `linear-gradient(150deg, ${currentColor}22, rgba(10,15,29,0.92) 58%)`,
              border: `1px solid ${currentColor}38`,
            }}
          >
            <div
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: 21,
                fontWeight: 700,
                color: "#f7f9ff",
              }}
            >
              周末放映室
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 15,
              }}
            >
              {[0, 1, 2].map((index) => {
                const entry = reveal(frame, fps, 55 + index * 8, 28);
                return (
                  <div
                    key={index}
                    style={{
                      flex: 1,
                      height: 145,
                      borderRadius: 13,
                      border: `1px solid ${index === 1 ? currentAlt : "rgba(255,255,255,0.12)"}`,
                      background: `linear-gradient(155deg, ${index === 1 ? currentColor : "rgba(60,74,112,0.52)"}, rgba(8,12,23,0.94))`,
                      boxShadow:
                        index === 1 ? `0 18px 30px ${currentColor}22` : undefined,
                      opacity: entry,
                      transform: `translateY(${(1 - entry) * 20 + Math.sin((frame + index * 35) / 40) * 3}px)`,
                    }}
                  >
                    <div
                      style={{
                        height: 94,
                        margin: 9,
                        borderRadius: 9,
                        background: `radial-gradient(circle at 60% 38%, ${currentAlt}5c, transparent 58%)`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 12,
                height: 3,
                borderRadius: 99,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${cycle * 20}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${currentColor}, ${currentAlt})`,
                }}
              />
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 15, height: 284 }}>
            <CardHeading label="动效" accent={currentAlt} />
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 13,
              }}
            >
              {["完整", "轻量", "关闭"].map((mode, index) => (
                <div
                  key={mode}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    textAlign: "center",
                    borderRadius: 8,
                    border:
                      index === 0
                        ? `1px solid ${currentAlt}50`
                        : "1px solid rgba(255,255,255,0.07)",
                    background:
                      index === 0
                        ? `${currentAlt}14`
                        : "rgba(255,255,255,0.02)",
                    fontFamily: UI_FONT,
                    fontSize: 8,
                    color:
                      index === 0
                        ? "rgba(244,248,255,0.86)"
                        : "rgba(219,228,247,0.4)",
                  }}
                >
                  {mode}
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 19,
                height: 116,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: 160,
                  height: 160,
                  borderRadius: "50%",
                  left: "50%",
                  top: "50%",
                  margin: "-80px",
                  border: `1px solid ${currentColor}45`,
                  transform: `rotate(${cycle * 18}deg) scale(${1.08 + Math.sin(frame / 24) * 0.04})`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  left: "50%",
                  top: "50%",
                  margin: "-46px",
                  background: `radial-gradient(circle, ${currentColor}, ${currentAlt})`,
                  boxShadow: `0 0 45px ${currentColor}66`,
                  opacity: 0.82,
                }}
              />
            </div>
          </GlassCard>
        </div>
      </div>
      <Cursor
        x={cursorX}
        y={cursorY}
        opacity={interpolate(frame, [38, 52], [0, 1], clamp)}
        clickFrame={160}
        label="切换主题"
      />
    </div>
  );
};

const ReleaseVisual: React.FC<{
  accent: string;
  accentAlt: string;
  releaseNotice?: string;
}> = ({ accent, accentAlt, releaseNotice }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = reveal(frame, fps, 15, 34);
  const titleIn = reveal(frame, fps, 27, 34);
  const noticeIn = reveal(frame, fps, 48, 32);
  const linkIn = reveal(frame, fps, 62, 28);
  const pulse = 0.9 + Math.sin(frame / 16) * 0.1;

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(circle at 50% 44%, ${accent}18, transparent 38%), radial-gradient(circle at 34% 64%, ${accentAlt}13, transparent 30%)`,
      }}
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            width: 160 + index * 100,
            height: 160 + index * 100,
            borderRadius: "50%",
            border: `1px solid ${index % 2 === 0 ? accent : accentAlt}${index === 1 ? "36" : "20"}`,
            opacity: logoIn * (0.92 - index * 0.18),
            transform: `scale(${0.92 + index * 0.06 + Math.sin((frame + index * 30) / 32) * 0.025}) rotate(${frame * (index + 1) * 0.035}deg)`,
          }}
        />
      ))}
      <div
        style={{
          opacity: logoIn,
          transform: `translateY(${(1 - logoIn) * 24}px) scale(${0.9 + logoIn * 0.1})`,
        }}
      >
        <BrandGlyph size={116} accent={accent} />
      </div>
      <div
        style={{
          marginTop: 23,
          fontFamily: DISPLAY_FONT,
          fontSize: 55,
          fontWeight: 700,
          letterSpacing: -1.7,
          color: "#fafbff",
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 20}px)`,
        }}
      >
        FutureVideo
      </div>
      <div
        style={{
          marginTop: 7,
          fontFamily: UI_FONT,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 4.2,
          color: "rgba(219,228,250,0.44)",
          opacity: titleIn,
        }}
      >
        YOUR PRIVATE SCREEN · 0.3.0 ALPHA
      </div>
      <div
        style={{
          marginTop: 29,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 22px",
          borderRadius: 999,
          border: `1px solid ${accentAlt}58`,
          background: `${accentAlt}13`,
          boxShadow: `0 0 35px ${accentAlt}18`,
          opacity: noticeIn,
          transform: `scale(${0.94 + noticeIn * 0.06})`,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: accentAlt,
            boxShadow: `0 0 16px ${accentAlt}`,
            transform: `scale(${pulse})`,
          }}
        />
        <span
          style={{
            fontFamily: UI_FONT,
            fontSize: 16,
            fontWeight: 600,
            color: "rgba(250,252,255,0.92)",
          }}
        >
          {releaseNotice}
        </span>
      </div>
      <div
        style={{
          marginTop: 28,
          padding: "10px 15px",
          borderRadius: 9,
          border: "1px solid rgba(255,255,255,0.09)",
          background: "rgba(255,255,255,0.025)",
          fontFamily: UI_FONT,
          fontSize: 10,
          letterSpacing: 0.7,
          color: "rgba(226,234,252,0.5)",
          opacity: linkIn,
        }}
      >
        Windows 10 / 11 · 完全本地
      </div>
    </div>
  );
};

export const AppVisual: React.FC<{
  visual: IntroVisual;
  accent: string;
  accentAlt: string;
  releaseNotice?: string;
}> = ({ visual, accent, accentAlt, releaseNotice }) => {
  switch (visual) {
    case "launch":
      return <LaunchVisual accent={accent} accentAlt={accentAlt} />;
    case "library":
      return <LibraryVisual accent={accent} accentAlt={accentAlt} />;
    case "playback":
      return <PlaybackVisual accent={accent} accentAlt={accentAlt} />;
    case "collections":
      return <CollectionsVisual accent={accent} accentAlt={accentAlt} />;
    case "tools":
      return <ToolsVisual accent={accent} accentAlt={accentAlt} />;
    case "audio":
      return <AudioVisual accent={accent} accentAlt={accentAlt} />;
    case "themes":
      return <ThemesVisual accent={accent} accentAlt={accentAlt} />;
    case "release":
      return (
        <ReleaseVisual
          accent={accent}
          accentAlt={accentAlt}
          releaseNotice={releaseNotice}
        />
      );
  }
};

export const AppMockup: React.FC<{
  visual: IntroVisual;
  accent: string;
  accentAlt: string;
  progress: number;
  releaseNotice?: string;
}> = ({ visual, accent, accentAlt, progress, releaseNotice }) => (
  <WindowShell
    visual={visual}
    accent={accent}
    progress={progress}
  >
    <AppVisual
      visual={visual}
      accent={accent}
      accentAlt={accentAlt}
      releaseNotice={releaseNotice}
    />
  </WindowShell>
);
