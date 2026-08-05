import { useMemo } from "react";

import type { ThemeConfig, ThemeDecoration } from "../types/siteSettings";

interface ThemeDecorationsProps {
  config: ThemeConfig;
  exiting?: boolean;
}

interface DecorationInstance {
  decoration: ThemeDecoration;
  key: string;
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
  fixedSlot: number;
}

const sizeMap = { sm: 26, md: 42, lg: 74 };

function decorationSize(decoration: ThemeDecoration) {
  if (decoration.size === "mixed") {
    return [sizeMap.sm, sizeMap.md, sizeMap.lg][Math.floor(Math.random() * 3)];
  }
  return sizeMap[decoration.size];
}

function renderDecoration(decoration: ThemeDecoration) {
  const color = decoration.color || "currentColor";

  if (decoration.element === "snowflake") return <span className="theme-decoration-text">❄</span>;
  if (decoration.element === "star") return <span className="theme-decoration-text">★</span>;
  if (decoration.element === "custom-svg" && decoration.customSvg) {
    return <span className="theme-decoration-custom" dangerouslySetInnerHTML={{ __html: decoration.customSvg }} />;
  }

  if (decoration.element === "ghost") {
    return (
      <svg viewBox="0 0 64 72" aria-hidden="true">
        <path d="M12 60V28C12 13 22 6 32 6s20 7 20 22v32l-8-6-8 6-8-6-8 6-8-6Z" fill={color} />
        <circle cx="25" cy="31" r="4" fill="#151019" />
        <circle cx="39" cy="31" r="4" fill="#151019" />
        <path d="M26 45c4 3 8 3 12 0" fill="none" stroke="#151019" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (decoration.element === "spider") {
    return (
      <svg viewBox="0 0 72 96" aria-hidden="true">
        <line x1="36" y1="0" x2="36" y2="34" stroke={color} strokeWidth="2" opacity="0.7" />
        <ellipse cx="36" cy="54" rx="14" ry="16" fill={color} />
        <circle cx="36" cy="36" r="9" fill={color} />
        {[20, 28, 44, 52].map((x, index) => (
          <g key={x}>
            <path d={`M34 50 C ${x} ${46 + index * 4}, ${x - 10} ${54 + index * 6}, ${x - 14} ${66 + index * 3}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <path d={`M38 50 C ${72 - x} ${46 + index * 4}, ${82 - x} ${54 + index * 6}, ${86 - x} ${66 + index * 3}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </g>
        ))}
        <circle cx="32" cy="35" r="1.5" fill="#fff" />
        <circle cx="40" cy="35" r="1.5" fill="#fff" />
      </svg>
    );
  }

  if (decoration.element === "spider-web") {
    return (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M0 0h118M0 0v118M0 0l118 118M0 0l40 118M0 0l118 40" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.7" />
        <path d="M20 0C20 18 8 24 0 24M44 0C44 36 18 48 0 48M70 0C70 56 28 76 0 76M96 0C96 78 40 102 0 102" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      </svg>
    );
  }

  if (decoration.element === "bauble") {
    return (
      <svg viewBox="0 0 64 72" aria-hidden="true">
        <rect x="24" y="4" width="16" height="10" rx="3" fill="#fbbf24" />
        <circle cx="32" cy="42" r="24" fill="#b91c1c" />
        <circle cx="24" cy="32" r="7" fill="#fff" opacity="0.45" />
        <path d="M16 48c10 8 22 9 34 0" fill="none" stroke="#fbbf24" strokeWidth="4" opacity="0.8" />
      </svg>
    );
  }

  if (decoration.element === "candy-cane") {
    return (
      <svg viewBox="0 0 64 96" aria-hidden="true">
        <path d="M22 86V28c0-14 10-22 22-18 10 4 12 18 2 24-7 4-14-1-14-8" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
        <path d="M22 86V28c0-14 10-22 22-18 10 4 12 18 2 24-7 4-14-1-14-8" fill="none" stroke="#dc2626" strokeWidth="5" strokeDasharray="10 10" strokeLinecap="round" />
      </svg>
    );
  }

  if (decoration.element === "pumpkin") {
    return (
      <svg viewBox="0 0 86 72" aria-hidden="true">
        <path d="M43 8c-10 0-16 8-16 26s6 30 16 30 16-12 16-30S53 8 43 8Z" fill="#f97316" />
        <ellipse cx="27" cy="38" rx="17" ry="26" fill="#ea580c" />
        <ellipse cx="59" cy="38" rx="17" ry="26" fill="#ea580c" />
        <path d="M43 10c2-8 7-9 12-6" fill="none" stroke="#15803d" strokeWidth="6" strokeLinecap="round" />
        <path d="M27 34l8-8 8 8M51 34l8-8 8 8M33 49c8 5 16 5 24 0" fill="none" stroke="#1c0a00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (decoration.element === "santa-hat") {
    return (
      <svg viewBox="0 0 96 72" aria-hidden="true">
        <circle cx="80" cy="15" r="10" fill="#fff" />
        <path d="M16 56C28 24 52 10 78 15 58 24 52 42 54 56H16Z" fill="#b91c1c" />
        <rect x="10" y="50" width="58" height="14" rx="7" fill="#fff" />
      </svg>
    );
  }

  return null;
}

export default function ThemeDecorations({ config, exiting = false }: ThemeDecorationsProps) {
  const instances = useMemo<DecorationInstance[]>(() => {
    const lowEnd = typeof navigator !== "undefined" && navigator.hardwareConcurrency < 4;
    return config.decorations.flatMap((decoration, decorationIndex) => {
      const baseCount = decoration.type === "fixed" ? decoration.count ?? 1 : decoration.count ?? 1;
      const count = lowEnd && decoration.type === "floating" ? Math.max(1, Math.round(baseCount * 0.5)) : baseCount;
      return Array.from({ length: count }, (_, index) => ({
        decoration,
        key: `${config.id}-${decoration.element}-${decorationIndex}-${index}`,
        left: Math.random() * 96,
        top: decoration.type === "fixed" ? 0 : Math.random() * 86,
        delay: Math.random() * -10,
        duration: 4 + Math.random() * 8,
        size: decorationSize(decoration),
        fixedSlot: index,
      }));
    });
  }, [config]);

  if (instances.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes theme-fall { from { transform: translate3d(0, -12vh, 0) rotate(0deg); } to { transform: translate3d(34px, 112vh, 0) rotate(360deg); } }
        @keyframes theme-float { 0%, 100% { transform: translate3d(0, -12px, 0); } 50% { transform: translate3d(18px, 12px, 0); } }
        @keyframes theme-sway { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes theme-spin { to { transform: rotate(360deg); } }
        @keyframes theme-fade-in-out { 0%, 100% { opacity: 0.25; transform: scale(.95); } 50% { opacity: 1; transform: scale(1.05); } }
        @media (prefers-reduced-motion: reduce) { .theme-decoration-item { animation-play-state: paused !important; } }
      `}</style>
      {(["behind-content", "above-content"] as const).map((layer) => {
        const layerItems = instances.filter((item) => item.decoration.zIndex === layer);
        if (layerItems.length === 0) return null;

        return (
          <div
            className={`theme-decoration-layer theme-decoration-layer-${layer} ${exiting ? "theme-decoration-layer-exit" : ""}`}
            key={layer}
            aria-hidden="true"
          >
            {layerItems.map((item) => {
              const { decoration } = item;
              const fixedStyle =
                decoration.type === "fixed"
                  ? decoration.element === "spider-web"
                    ? { top: 0, left: item.fixedSlot % 2 === 0 ? 0 : "auto", right: item.fixedSlot % 2 === 0 ? "auto" : 0 }
                    : { top: 78, left: 18 }
                  : { top: `${item.top}%`, left: `${item.left}%` };

              return (
                <span
                  className={`theme-decoration-item theme-decoration-${decoration.element} theme-decoration-${decoration.animation}`}
                  key={item.key}
                  style={{
                    ...fixedStyle,
                    width: item.size,
                    height: item.size,
                    color: decoration.color || "currentColor",
                    opacity: decoration.opacity,
                    animationDelay: `${item.delay}s`,
                    animationDuration: `${item.duration}s`,
                  }}
                >
                  {renderDecoration(decoration)}
                </span>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
