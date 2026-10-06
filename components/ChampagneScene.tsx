import { useId } from "react";
import type { CSSProperties } from "react";

/**
 * Scène de la page de connexion : une flûte (vins mousseux VDV) et une coupe
 * (cocktails Belgravia) au trait doré, avec des bulles qui montent en
 * continu. Le mouvement est volontairement unique et lent — c'est le seul
 * élément animé de la page. Les bulles sont calculées de façon déterministe
 * (pas de Math.random) pour éviter tout écart entre rendu serveur et client.
 */

type Bulle = { cx: number; cy: number; r: number; dy: number; dur: number; delay: number };

const BULLES_FLUTE: Bulle[] = Array.from({ length: 15 }, (_, i) => ({
  cx: 125 + ((i * 53) % 31),
  cy: 232 - ((i * 29) % 70),
  r: 1.1 + ((i * 7) % 4) * 0.55,
  dy: -(150 + ((i * 11) % 30)),
  dur: 4.6 + (i % 5) * 0.9,
  delay: -(i * 0.83),
}));

const BULLES_PANACHE: Bulle[] = Array.from({ length: 6 }, (_, i) => ({
  cx: 128 + ((i * 41) % 24),
  cy: 66,
  r: 0.9 + (i % 3) * 0.5,
  dy: -(46 + ((i * 13) % 26)),
  dur: 3.4 + (i % 3) * 0.8,
  delay: -(i * 0.9),
}));

const BULLES_COUPE: Bulle[] = Array.from({ length: 8 }, (_, i) => ({
  cx: 222 + ((i * 47) % 56),
  cy: 272 - ((i * 17) % 34),
  r: 1 + ((i * 5) % 3) * 0.55,
  dy: -(52 + ((i * 9) % 22)),
  dur: 4.2 + (i % 4) * 0.8,
  delay: -(i * 0.7),
}));

function Bulles({ liste, couleur }: { liste: Bulle[]; couleur: string }) {
  return (
    <>
      {liste.map((b, i) => (
        <circle
          key={i}
          className="bulle"
          cx={b.cx}
          cy={b.cy}
          r={b.r}
          fill="none"
          stroke={couleur}
          strokeWidth="0.8"
          style={
            {
              "--dy": `${b.dy}px`,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

export default function ChampagneScene({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const or = `or${uid}`;
  const vin = `vin${uid}`;
  const rose = `rose${uid}`;

  return (
    <svg
      viewBox="60 0 260 420"
      className={className}
      role="img"
      aria-label="Une flûte de vin mousseux et une coupe de cocktail"
      fill="none"
    >
      <defs>
        <linearGradient id={or} gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="400">
          <stop offset="0" stopColor="#F7EBD0" />
          <stop offset="0.55" stopColor="#E6CC9A" />
          <stop offset="1" stopColor="#B8893F" />
        </linearGradient>
        <linearGradient id={vin} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3DFA8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#D9B45E" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={rose} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9A9A3" stopOpacity="0.55" />
          <stop offset="1" stopColor="#B8586A" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Flûte — vins mousseux */}
      <path d="M117 50C117 140 126 205 140 240C154 205 163 140 163 50" stroke={`url(#${or})`} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="140" cy="50" rx="23" ry="3.4" stroke={`url(#${or})`} strokeWidth="1.2" />
      <path d="M118.4 82H161.6C160 150 154 205 140 240C126 205 120 150 118.4 82Z" fill={`url(#${vin})`} />
      <path d="M118.4 82Q140 87 161.6 82" stroke="#F7EBD0" strokeOpacity="0.7" strokeWidth="1" />
      <path d="M125 66C125.5 120 130 170 136 214" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M140 240V382" stroke={`url(#${or})`} strokeWidth="1.6" />
      <path d="M104 394C118 382 162 382 176 394" stroke={`url(#${or})`} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="140" cy="394" rx="36" ry="3.6" stroke={`url(#${or})`} strokeWidth="1.2" />
      <Bulles liste={BULLES_FLUTE} couleur="#F7EBD0" />
      <Bulles liste={BULLES_PANACHE} couleur="#F7EBD0" />

      {/* Coupe — cocktails Belgravia */}
      <path d="M198 206C198 266 222 284 250 284C278 284 302 266 302 206" stroke={`url(#${or})`} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="250" cy="206" rx="52" ry="6.5" stroke={`url(#${or})`} strokeWidth="1.2" />
      <path d="M199.4 222Q250 232 300.6 222C297 262 276 281 250 281C224 281 203 262 199.4 222Z" fill={`url(#${rose})`} />
      <path d="M199.4 222Q250 232 300.6 222" stroke="#F4C9C0" strokeOpacity="0.7" strokeWidth="1" />
      <path d="M250 284V382" stroke={`url(#${or})`} strokeWidth="1.6" />
      <path d="M216 394C230 382 270 382 284 394" stroke={`url(#${or})`} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="250" cy="394" rx="34" ry="3.6" stroke={`url(#${or})`} strokeWidth="1.2" />
      <Bulles liste={BULLES_COUPE} couleur="#F4C9C0" />

      {/* Rondelle de citron posée sur le bord de la coupe */}
      <g transform="translate(292 196) rotate(-18)" stroke={`url(#${or})`} strokeWidth="1.1">
        <circle r="13" />
        <circle r="9.5" strokeOpacity="0.6" />
        <path d="M0-9.5V9.5M-9.5 0H9.5M-6.7-6.7L6.7 6.7M-6.7 6.7L6.7-6.7" strokeOpacity="0.55" />
      </g>
    </svg>
  );
}
