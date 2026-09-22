# Design

Scene: a FUT player at a desk in the evening, alt-tabbing between the EA web app and FC Solver. Matching the web app's dark teal keeps that switch seamless, so the theme is dark by design, not by default.

## Brand
FC Solver. Logo files live in `web/public/brand/`:
- `logo-on-dark.svg` wordmark for dark surfaces (the app), `logo-on-light.svg` for light ones.
- `icon-green.svg` square check icon: favicon, narrow topbar, extension icons (`extension/icons/*.png`, rendered from it). `icon-lime.svg` and `mark-fc.svg` are alternates.
- Brand colors (logo only, the UI keeps the tokens below): deep green `#0E3B2B`, lime `#C8F53C`, cream `#F3F1EA`, ink `#0D1411`.

## Color (OKLCH, restrained + one accent)
- `--bg-0` oklch(0.19 0.035 215) page base; background is a slow teal to green field like the web app.
- `--surface` oklch(0.23 0.03 220 / 0.92) pitch frame and panels; `--surface-2` oklch(0.27 0.03 220) raised controls.
- `--pitch` oklch(0.34 0.07 185) to oklch(0.27 0.06 200) pitch gradient; lines oklch(0.55 0.05 190 / 0.35).
- `--ink` oklch(0.96 0.01 200) text; `--ink-2` oklch(0.78 0.02 210) secondary; `--ink-3` oklch(0.62 0.02 210) tertiary.
- Accent `--go` oklch(0.84 0.17 163), the EA green: primary action (Solve), met requirements, active selection. Nothing else.
- Positional `--pos` oklch(0.86 0.16 88): ONLY position labels under cards (game convention).
- `--bad` oklch(0.68 0.19 25): unmet requirement glyph + error banner.

## Type
- Display / numbers: Barlow Condensed 600-700 (card rating, header values, set names in tabs).
- UI: Geist 400-600.
- Scale: 12 / 13 / 15 / 18 / 24 / 32.

## Shape
Rule: interactive controls 8px, containers 14px, pills full. Cards use the EA shield art, never CSS rounded rectangles.

## Components
- Pitch frame with trapezoid header strip (Requirements, Rating, Chemistry) and trapezoid corner buttons (Options bottom-left, Solve bottom-right) as in the web app.
- FUT card: EA background art, portrait, rating over position, name, flag + league + club row.
- Slot foot: 3 chemistry pips + position pill.

## Motion
150-220ms ease-out-quart on hover/press; cards fade-rise in on solve (staggered 20ms). Respect prefers-reduced-motion.
