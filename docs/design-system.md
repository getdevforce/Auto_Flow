# Design system

Tokens live in `apps/extension/styles/tokens.css` (and are mirrored for Filament in the API theme).

- Color: neutrals plus one accent (deep teal, `#0F6B66` light, `#3DB7AE` dark). Status colors: danger, warn, ok. Light and dark are tuned separately, both meet WCAG AA for body text.
- Type: Instrument Sans (UI), JetBrains Mono (logs), self-hosted via @fontsource. Base 13px, scale 11/13/15/18/24.
- Spacing: 4/8pt grid. Radius 4/6/10. Elevation: 1px borders first, soft shadow only for overlays.
- Motion: 120-180ms, ease-out, only to explain state change; disabled under `prefers-reduced-motion`.
- Icons: Lucide, 1.5 stroke, used sparingly.
- Not allowed: glow, gradient buttons, glassmorphism, sparkle icons, emoji, robot/wand imagery.
- Patterns: real empty states naming the next action, skeletons not spinners, inline validation, undo over confirm, visible shortcut sheet.
