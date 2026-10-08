// The invite reward as an Ultimate Team special item: a gold "7 days of Premium" card drawn in SVG
// (shield silhouette, banded metal rim, engraved guilloché medallion, letterpress type) with an FC Solver
// card back, so the stage can flip it like a walkout. Decorative: the section copy carries the meaning.
import { useI18n } from '../i18n';

// FUT shield silhouette in a 300 x 420 box; the rim, groove and face are the same path scaled inwards
const SHIELD =
  'M30 58C46 56 56 46 60 34C64 22 76 16 94 16L206 16C224 16 236 22 240 34C244 46 254 56 270 58L270 344C270 358 262 364 248 368C206 378 172 384 150 404C128 384 94 378 52 368C38 364 30 358 30 344Z';
const inset = (s: number) => `translate(150 210) scale(${s}) translate(-150 -210)`;
// guilloché rosette: thin ellipses turned around a centre, the engraved pattern of banknotes and special items
const ROSETTE = Array.from({ length: 18 }, (_, k) => k * 10);
const CROWN = 'M-30 14L-36-22L-15-2L0-32L15-2L36-22L30 14Z';

function Rosette({ cx, cy, r, stroke, opacity }: { cx: number; cy: number; r: number; stroke: string; opacity: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`} fill="none" stroke={stroke} strokeWidth="0.6" opacity={opacity}>
      {ROSETTE.map((a) => (
        <ellipse key={a} rx={r} ry={r * 0.38} transform={`rotate(${a})`} />
      ))}
      <circle r={r} strokeWidth="0.9" />
      <circle r={r * 0.9} />
    </g>
  );
}

/** Letterpress text: a light copy one unit lower reads as the lit lower edge of a pressed-in letter. */
function Press({ x, y, className, children }: { x: number; y: number; className: string; children: string }) {
  return (
    <>
      <text x={x} y={y + 1.2} className={`${className} lp-rc-lit`} textAnchor="middle">{children}</text>
      <text x={x} y={y} className={className} textAnchor="middle">{children}</text>
    </>
  );
}

function Defs() {
  return (
    <defs>
      <clipPath id="lpr-clip">
        <path d={SHIELD} transform={inset(0.935)} />
      </clipPath>
      {/* banded rim: alternating bright and dark bands read as polished metal */}
      <linearGradient id="lpr-rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff2c4" />
        <stop offset="0.18" stopColor="#c08f2e" />
        <stop offset="0.36" stopColor="#f7dc8e" />
        <stop offset="0.55" stopColor="#7d5714" />
        <stop offset="0.74" stopColor="#ecc874" />
        <stop offset="1" stopColor="#8a6018" />
      </linearGradient>
      <linearGradient id="lpr-face" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#f8e7ab" />
        <stop offset="0.38" stopColor="#e3c067" />
        <stop offset="0.66" stopColor="#cfa144" />
        <stop offset="1" stopColor="#e6c77c" />
      </linearGradient>
      <linearGradient id="lpr-plate" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f1d68c" />
        <stop offset="1" stopColor="#d9b25a" />
      </linearGradient>
      <radialGradient id="lpr-spec" cx="0.28" cy="0.16" r="0.7">
        <stop offset="0" stopColor="#fffbe8" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fffbe8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lpr-medal" r="0.5">
        <stop offset="0" stopColor="#fff4cc" stopOpacity="0.9" />
        <stop offset="0.7" stopColor="#f0d283" stopOpacity="0.4" />
        <stop offset="1" stopColor="#c99a3a" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="lpr-crown" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8f6519" />
        <stop offset="1" stopColor="#4a3208" />
      </linearGradient>
      <linearGradient id="lpr-sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fffbe6" stopOpacity="0" />
        <stop offset="0.5" stopColor="#fffbe6" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="lpr-back" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor="#24564a" />
        <stop offset="0.55" stopColor="#163a33" />
        <stop offset="1" stopColor="#0e2723" />
      </linearGradient>
      <linearGradient id="lpr-plane" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#fffbe8" stopOpacity="0.05" />
        <stop offset="0.6" stopColor="#fffbe8" stopOpacity="0.45" />
        <stop offset="1" stopColor="#fffbe8" stopOpacity="0.1" />
      </linearGradient>
      {/* the fine striated foil of EA's gold art */}
      <pattern id="lpr-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-34)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="#fff6d6" strokeWidth="0.8" />
      </pattern>
    </defs>
  );
}

function Rim() {
  return (
    <>
      <path d={SHIELD} fill="url(#lpr-rim)" />
      <path d={SHIELD} transform={inset(0.955)} fill="#5a3d0b" />
    </>
  );
}

export function PremiumCard() {
  const { t } = useI18n();
  return (
    <div className="lp-reward-flip">
      <svg className="lp-reward-side lp-reward-front" viewBox="0 0 300 420" aria-hidden="true" focusable="false">
        <Defs />
        <Rim />
        <g clipPath="url(#lpr-clip)">
          <rect width="300" height="420" fill="url(#lpr-face)" />
          <rect width="300" height="236" fill="url(#lpr-hatch)" opacity="0.3" />
          {/* angular glass planes catching light, after EA's gold item art */}
          <path d="M0 214L300 70V104L0 236Z" fill="url(#lpr-plane)" />
          <path d="M40 236L300 132V150L96 236Z" fill="url(#lpr-plane)" opacity="0.7" />
          <rect y="236" width="300" height="184" fill="url(#lpr-plate)" />
          <rect width="300" height="420" fill="url(#lpr-spec)" />
          {/* medallion: engraved rosette around the crown, where a player's portrait would stand */}
          <circle cx="178" cy="128" r="66" fill="url(#lpr-medal)" />
          <Rosette cx={178} cy={128} r={62} stroke="#7a5514" opacity={0.42} />
          <Rosette cx={178} cy={128} r={44} stroke="#fff4d0" opacity={0.6} />
          <g transform="translate(178 132)">
            <path d={CROWN} transform="translate(0 1.4)" fill="#fff3cc" opacity="0.7" />
            <path d={CROWN} fill="url(#lpr-crown)" />
            <rect x="-31" y="18" width="62" height="9" rx="2" fill="#fff3cc" opacity="0.7" transform="translate(0 1.4)" />
            <rect x="-31" y="18" width="62" height="9" rx="2" fill="url(#lpr-crown)" />
            {[[-36, -22], [0, -32], [36, -22]].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="5" fill="#5b3e0a" stroke="#fff3cc" strokeOpacity="0.6" strokeWidth="1" />
            ))}
          </g>
          {/* engraved seam between the foil and the name plate */}
          <path d="M20 236H280" stroke="#7a5514" strokeWidth="1.2" />
          <path d="M20 238H280" stroke="#fff3cc" strokeWidth="0.8" opacity="0.7" />
          <g className="lp-rc-sheen">
            <rect x="-40" y="-30" width="70" height="480" fill="url(#lpr-sheen)" transform="skewX(-16)" />
          </g>
        </g>
        {/* left column, where rating and position sit on a player item */}
        <Press x={76} y={124} className="lp-rc-num lp-rc-ovr">7</Press>
        <Press x={76} y={148} className="lp-rc-num lp-rc-unit">{t('landing.invite.card.days')}</Press>
        <path d="M60 160H92" stroke="#5a3d0b" strokeWidth="1" opacity="0.6" />
        {/* engraved inner border, then the FC Solver check struck at the tip like a hallmark */}
        <path d={SHIELD} transform={inset(0.885)} fill="none" stroke="#fff3cc" strokeWidth="1" opacity="0.7" />
        <path d={SHIELD} transform={`translate(0 -1) ${inset(0.885)}`} fill="none" stroke="#7a5514" strokeWidth="1" />
        <path d="M141 351L147 357L159 344" transform="translate(0 1.2)" fill="none" stroke="#fff3cc" strokeOpacity="0.7" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M141 351L147 357L159 344" fill="none" stroke="#5a3d0b" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <Press x={150} y={278} className="lp-rc-num lp-rc-name">Premium</Press>
        <g stroke="#6b4a10" strokeWidth="1" opacity="0.75">
          <path d="M84 293H140M160 293H216" />
          <path d="M150 288L155 293L150 298L145 293Z" fill="#6b4a10" stroke="none" />
        </g>
        <Press x={150} y={322} className="lp-rc-sub">{t('landing.invite.card.for')}</Press>
      </svg>

      <svg className="lp-reward-side lp-reward-back" viewBox="0 0 300 420" aria-hidden="true" focusable="false">
        <Rim />
        <g clipPath="url(#lpr-clip)">
          <rect width="300" height="420" fill="url(#lpr-back)" />
          <rect width="300" height="420" fill="url(#lpr-hatch)" opacity="0.06" />
          <Rosette cx={150} cy={206} r={104} stroke="#e8c877" opacity={0.28} />
          <Rosette cx={150} cy={206} r={70} stroke="#e8c877" opacity={0.4} />
        </g>
        <circle cx="150" cy="206" r="36" fill="#0e2723" stroke="url(#lpr-rim)" strokeWidth="4" />
        <image href="/brand/icon-green.svg" x="128" y="184" width="44" height="44" />
      </svg>
    </div>
  );
}
