import { useEffect, useRef, useState } from 'react';

const W = 1440;
const H = 96;
const STEP = 24;
const FRAMES = 36;

type LayerConfig = {
  baseline: number;
  amp: number;
  offset: number;
  duration: string;
  fill: string;
  opacity: number;
  foam?: boolean;
};

// Every time term below is an integer multiple of `phase`, so the loop is seamless.
// Each layer is a main wave + a counter-wave + a ripple, scaled by a slow swell
// envelope that travels the other way, so crests rise and settle locally.
function crest(phase: number, { baseline, amp, offset }: LayerConfig) {
  const height = (x: number) => {
    const k = (x / W) * Math.PI * 2;
    const swell = 0.65 + 0.35 * Math.sin(k * 1.5 + phase + offset * 2);
    const main = Math.sin(k - phase + offset);
    const counter = 0.5 * Math.sin(k * 2.3 + phase * 2 + offset * 1.7);
    const ripple = 0.2 * Math.sin(k * 4.7 - phase * 3 + offset * 0.6);
    return baseline + amp * swell * (main + counter + ripple);
  };

  const pts: [number, number][] = [];
  for (let x = 0; x <= W; x += STEP) pts.push([x, height(x)]);

  let d = `M0 ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q${x} ${y.toFixed(1)} ${(x + nx) / 2} ${((y + ny) / 2).toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${W} ${last[1].toFixed(1)}`;
}

const layers = (
  [
    { baseline: 25, amp: 9, offset: 0, duration: '11s', fill: '#fdcd43', opacity: 0.55 },
    { baseline: 38, amp: 10, offset: 0.4, duration: '9s', fill: '#c8dbb1', opacity: 1, foam: true },
    { baseline: 51, amp: 11, offset: 0.8, duration: '7.5s', fill: 'currentColor', opacity: 1, foam: true },
  ] as LayerConfig[]
).map(layer => {
  const crests = Array.from({ length: FRAMES + 1 }, (_, frame) =>
    crest((frame * Math.PI * 2) / FRAMES, layer)
  );
  return {
    ...layer,
    crests,
    fills: crests.map(c => `${c} L${W} ${H} L0 ${H} Z`),
  };
});

export default function HeroOceanWave({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    const update = () => setMoving(visible && !document.hidden && !preference.matches);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    if (svg.current) observer.observe(svg.current);
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <svg
      ref={svg}
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {layers.map(layer => (
        <g key={layer.fill}>
          <path d={layer.fills[0]} fill={layer.fill} opacity={layer.opacity}>
            {moving && (
              <animate
                attributeName="d"
                values={layer.fills.join(';')}
                dur={layer.duration}
                repeatCount="indefinite"
                calcMode="linear"
              />
            )}
          </path>
          {layer.foam && (
            <path
              d={layer.crests[0]}
              fill="none"
              stroke="#fff8e1"
              strokeOpacity=".6"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            >
              {moving && (
                <animate
                  attributeName="d"
                  values={layer.crests.join(';')}
                  dur={layer.duration}
                  repeatCount="indefinite"
                  calcMode="linear"
                />
              )}
            </path>
          )}
        </g>
      ))}

      <g fill="none" stroke="#7baf4b" strokeWidth="2" strokeLinecap="round" opacity=".55">
        <path vectorEffect="non-scaling-stroke" d="M70 18 q14-8 28 0 t28 0 t28 0 M1110 16 q12-7 24 0 t24 0" />
        <path vectorEffect="non-scaling-stroke" d="M355 12 l4 7 m-16-2 7 2 M1300 16 l4 6 m8-11-2 7 M760 14 l6 3 m8-8-2 6" />
      </g>
      <g fill="#e7b83e" opacity=".75">
        <circle cx="238" cy="15" r="3" />
        <circle cx="252" cy="22" r="2" />
        <circle cx="1194" cy="17" r="3" />
        <circle cx="1210" cy="22" r="2" />
        <circle cx="610" cy="18" r="2.5" />
        <circle cx="625" cy="12" r="1.5" />
      </g>
    </svg>
  );
}
