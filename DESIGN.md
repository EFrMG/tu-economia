# Tu Economía. Design System

## 1. Creative North Star: The Digital Sanctuary

**Tu Economía** is a precision tool for navigating economic volatility with absolute clarity. The design system embodies **Terminal-Influenced Minimalism**, prioritizing information density without visual noise.

It is dark-mode-first.

> This file is the working reference and reflects what is implemented; where it disagrees with the code, the code wins.

---

## 2. Color Palette

The system uses a tiered background approach to create depth without relying on traditional shadows, utilizing Tailwind CSS v4 variables.

### 2.1 Base Tiers

- **Base (Global Backdrop):** `--color-base-950`.
- **Surface (Containers):** `--color-surface-950` anchors terminal panels; `--color-surface-900` adds a restrained raised state and preserves the marketing card tone.
- **Overlay (Modals/Popovers):** `--color-overlay-950`. The highest elevation layer.

### 2.2 Semantic Accents

- **Primary (Cyber Blue):** `--color-primary-500`. Used for primary actions, navigation highlights, and growth.
- **Secondary (Terminal Green):** `--color-secondary-500`. Reserved for success states, buy signals, and positive market indicators.
- **Tertiary (Muted Amber):** `--color-tertiary-500`. Used for warnings, hold signals, neutral market shifts, and legal or informational states (muted text also works).
- **Red:** `--color-red-500`. Used strictly for negative movement or genuine risk: negative trends, high-risk alerts, or capital flight.

### 2.3 Typography & Borders

- **Text tiers** (neutral ramp, warm-grey, on the dark base):
  - **Primary:** `--color-text-100`: headings and figures.
  - **Secondary:** `--color-text-300`: body copy and descriptions.
  - **Labels:** `--color-text-200`: uppercase data labels.
  - **Metadata:** `--color-text-400`: timestamps, footnotes.

- **Accent text:** each accent has a `*-text-*` ramp tuned for legibility against dark surfaces (`--color-primary-text-*`, `--color-secondary-text-*`, `--color-tertiary-text-*`, `--color-red-text-*`). Use these for coloured _text_; the plain ramps are for fills and strokes.

- **Borders:** `--color-base-700` is the standard hairline. Eventually, we want to implement a transparent border that has a gradient that follows the mouse appear behind.

---

## 3. Typography

Typography is split between humanistic approachability and technical precision.

- **Headlines:** **Geist**. A modern, geometric sans-serif that provides an authoritative editorial impact.
- **Body:** **Inter**. The industry standard for high-legibility interface text.
- **Data & Labels:** **JetBrains Mono**. Used for all numerical values, exchange rates, and technical metadata to ensure "scannability" and a HUD (Heads Up Display) feel.
- **Scale:** Terminal pages use `text-headline-*`, `text-body-*`, and data label tokens. Marketing pages use `text-marketing-display`, `text-marketing-feature`, `text-marketing-section`, and `text-marketing-lead` for their larger editorial hierarchy.
- **Delivery:** The three variable Latin font faces are bundled with the app and served from its own origin; `app/css/typefaces.css` defines their font faces.

The wordmark combines the Geist brand name with a geometric TE monogram. The favicon uses a filled TE variant with two terminal-corner accents so the letters remain legible at 16–32px. Its standalone SVG uses resolved values from the base, surface, outline, primary, and text palette roles. Neither mark introduces a market-direction cue.

---

## 4. Layout & Spacing

The layout uses a **Fixed Grid Strategy** to instill architectural stability.

- **Base Unit:** 4px (`--spacing`). All metrics are multiples of this unit; data-dense layouts step in multiples of 8px.
- **Vertical rhythm (`stack`, `stack-*`):** Gap steps are multiples of 8px, even steps only. The canonical ladder: `stack-2` (8px) for tight label/value pairs and header title-with-subtitle groups, `stack-4` (16px) for card and panel internals, `stack-6` (24px, also the bare `stack` default) for loose panel internals, `stack-8` (32px) between sections inside a page, and `stack-10`/`stack-12` (40/48px) for page-level rhythm. Odd steps (`stack-1`, `stack-3`, `stack-5`, …) are not used, except `stack-1` (4px) in the mobile cells of `FinanceMonthBar.tsx`, where `stack-0` is too tight and `stack-2` makes the sticky header too tall. `stack-0` (Sidebar) and `stack-48` (marketing hero) are reserved special cases.
- **Container Max:** 1200px, both the terminal canvas and marketing pages use `--container-terminal` through `.page-container`.
- **Gutter:** 16px.
- **Margins:**
  - Mobile: 16px.
  - Desktop: 32px.
- **Grid:** 12-column grid on desktop.

---

## 5. Shape & Elevation

- **Edges:** Strictly geometric. Terminal-shell surfaces (data cards, panels, inputs) are sharp, 0px. The marketing `.card` uses `rounded-sm`, the maximum radius anywhere in the system.
- **Surfaces:** Marketing cards use translucent `surface-900`; terminal cards use `surface-950` with `surface-900` for raised controls and hover states. Popovers use `overlay-950`. Both layouts use `base-700` for their standard border.
- **Depth:** Tonal layering and subtle outlines establish the base hierarchy. The marketing `.card` keeps its restrained primary-tinted shadow as an intentional accent; add no new drop shadows.
- **Interactive Feedback:** Use the custom easing functions such as `--ease-in-swift`, or create new ones for high-performance transitions.
- **Reduced motion:** Marketing entrance effects and feature scaling honor it.
- **Scrolling:** Marketing pages use Lenis for smooth scrolling except under `prefers-reduced-motion`. Sticky feature sections and their scale effect activate only on roomy desktop viewports; smaller screens keep the sections in normal flow.

---

## 6. Implementation Mandates

- **Stable geometry across data states:** A section must occupy the same footprint while loading, when populated, and when the source fails, so nothing below it ever shifts. Keep the loaded structure in every state and swap the content inside it; the data card's footer row, the hero card's right-hand slot, the converter's helper line, and the chart's plotting area all render in every state. Skeletons reserve the final element's line box, unavailable values read `s/d`, and a failed block explains itself in the slot it already owns: `UnavailableNotice` when the notice owns the block, `UnavailableStatus` when it inherits a fixed-height line.
- **Unavailable, not absent:** Never replace a populated block with a smaller notice. When there is no data to draw, stand in for the plotting area (`PlotUnavailable`) or keep the controls in place disabled; the notice explains the state, it does not take over the section's height. Verify both states side by side with `?preview=unavailable` before calling the work done.
- **Monospace for Data:** All economic figures, percentages, and tickers must use `font-mono`.
- **Uppercase Labels:** Small data labels should be in uppercase with increased letter spacing; use the `text-label-caps` and `text-data-label` tokens, which already carry the tracking and weight, rather than composing something like `text-[10px] tracking-widest` by hand.
- **Tokens:** reference the tokens in `tailwind-theme.css` and never hardcode color; the rules for adding to `@theme` are in [AGENTS.md](AGENTS.md).
