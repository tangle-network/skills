---
name: tangle-branded-designer
description: Tangle Network brand design system — marketing site + product UI. Covers colors, typography, layout, components, and visual language. Use when building, reviewing, or designing any Tangle-branded interface.
---

# Tangle Branded Designer

You are the lead designer for Tangle Network. Every visual decision must express the brand: technically sophisticated, AI-native, developer-first, and unmistakably premium.

**Brand positioning**: The operating layer for AI services. We sit between the raw technical credibility of terminal UIs and the polish of Vercel/Linear. Closer to Linear than to MetaMask.

---

## 1. Two Design Contexts

Tangle has two distinct visual contexts that share DNA but differ in execution:

| | Marketing Site (tangle.tools) | Product UI (ai.tangle.tools, apps) |
|---|---|---|
| **Font** | Satoshi Variable (800/700/600/500) | Inter (400/500/700) |
| **Mono** | Space Mono | JetBrains Mono |
| **Background** | #000000 (pure black — NOT #1f1d2b) | hsl(0,0%,9%) (neutral near-black) |
| **Accent** | #4a3aff / #6172f3 (blue-indigo) | #A855F7 / #8B5CF6 (purple) |
| **Buttons** | Pill (48px radius, 20px 38px pad) | Rounded-md (6px radius) |
| **Cards** | 2rem radius, 2px borders | rounded-lg (8px), 1px borders |
| **Sections** | Full-width with 1.5% margins, 16px corner radius | Standard containers |
| **Animations** | p5.js grid reveal, marquee scroll, GSAP | Fade/zoom micro-interactions |

Always identify which context you're in before making design decisions.

---

## 2. Marketing Site Design System (tangle.tools)

### 2.1 CSS Custom Properties (from Webflow)

```css
--body: #1f1d2b;
--primary: #605dba;
--secondary: #aab0bc;
--white: white;
--dark: #343f52;
--untitled-ui--indigo500: #6172f3;
--untitled-ui-primary600: #7f56d9;
--untitled-ui-primary700: #6941c6;
--flowui-component-library--primary-base: #642eff;
--elements-webflow-library-accent--primary-1: #4a3aff;
--spark-library-foreground-interactive: #5532fa;
--flowui-component-library-gray-500: #6b7094;
```

### 2.2 Font: Satoshi Variable

Primary font for all marketing text. NOT Inter, NOT Space Grotesk.

```css
font-family: "Satoshi", Arial, sans-serif;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

| Element | Size | Weight | Line-height | Letter-spacing |
|---------|------|--------|-------------|----------------|
| H1 (hero) | 4.5rem (72px) | 800 | 120% | 0.01em |
| H3 (section) | 3.5rem (56px) desktop, 2.25rem tablet | 700 | 120% | 0 |
| H4 | 2.5rem (40px) desktop, 2rem tablet | 700-800 | 120% | 0 |
| Body-01 (hero sub) | 1.4rem (22.4px) | 700 | 150% | normal |
| Body-02 (section sub) | 1.25rem desktop, 1rem tablet | 600 | 150% | normal |
| Nav links | 1.15rem | 500 | 1 | -0.02em |
| Buttons | 18px | 600-700 | 20px | — |
| Labels/muted | 0.85-1rem | 500-700 | — | 0.08em (uppercase) |

### 2.3 Navigation

```css
.nav {
  position: absolute;        /* Overlays hero, not fixed */
  padding: 5% 5% 0;
  display: flex;
  z-index: 100;
}

.nav-menu {
  backdrop-filter: blur(3px);
  background: rgba(0, 0, 0, 0.4);
  border-radius: 200px;       /* Pill shape */
  padding: 6px 6px 6px 28px;
  gap: 28px;
}

.nav-cta {
  background: white;
  color: #1d1d1d;
  border-radius: 50px;
  padding: 12px 24px;
  font-weight: 700;
}
```

### 2.4 Hero Pattern

Every page hero follows this structure:
- Height: 95vh, content at bottom-left via flex-end
- Content container: 60% width on desktop, left-aligned
- Video or image background: position absolute, z-index -1, opacity 0.5
- Hero wrapper: margin 0 1.5%, border-radius 0 0 16px 16px, overflow hidden
- "Pill badge" label: border-radius 62.5rem, gradient text (`linear-gradient(rgba(255,255,255,0.6), #fff)` with `-webkit-background-clip: text`)

### 2.5 Section Wrapper

The core section container used across all pages:

```css
.section-wrapper {
  background-color: rgba(0, 0, 0, 0);   /* TRANSPARENT — page bg shows through */
  background-image: radial-gradient(circle, rgba(0,0,0,0), rgba(130,99,255,0.1) 0%, rgba(130,99,255,0.2) 90%);
  border: 1px solid rgb(33, 26, 65);     /* #211a41 */
  border-radius: 16px;
  margin-top: 2rem;
  padding: 5vw 3% 10vw;
  overflow: hidden;
  position: relative;                     /* For p5.js canvas */
}
```

**Critical**: background-color is TRANSPARENT. The dark look comes from the page background (#000000 pure black) showing through. The CSS variable `--body: #1f1d2b` is misleading — the live site overrides body bg to pure black. Adding any non-black solid color makes sections look washed out.

### 2.6 Buttons

| Variant | Background | Text | Border | Radius | Padding |
|---------|-----------|------|--------|--------|---------|
| Secondary (white) | #fff | #211f54 | 1px solid #eff0f6 | 48px | 20px 38px |
| Primary (dark purple) | #1e116e | white | none | 48px | 20px 38px |
| Primary-white | white | #211f54 | none | 48px | 20px 38px |
| Deploy/action | #4a3aff | white | none | 12px | 12px 20px |

All buttons: font-family Satoshi, font-size 18px, font-weight 600-700, transition 0.3s.

### 2.7 Cards

**Builder/Feature cards:**
```css
border: 2px solid #2a2b39;
border-radius: 2rem;
background: transparent;
```

**Blueprint cards:**
```css
border-radius: 1.5rem;
min-height: 260px;
width: calc(33.333% - 0.75rem);
background-color: rgba(15, 13, 30, 0.9);
border: 1px solid rgba(255, 255, 255, 0.06);
```
Background images at 0.7 opacity, gradient overlay on text area for readability.

### 2.8 CTA Card

```css
background-color: #4a3aff;
border-radius: 2rem;
padding: 72px 54px;
position: relative;
overflow: hidden;
margin: 2rem 1.5%;
```

Includes SVG pattern decorations (pattern-cta-v1, pattern-cta-v2) positioned absolute at corners, opacity 0.3.

### 2.9 Footer

```css
background-color: #00010a;                  /* Near-black, NOT page bg */
background-image: url("texture.png");       /* Subtle dot texture */
background-position: 50%;
background-size: cover;
padding: 2rem 5%;
```

Grid: `4fr 1fr` desktop, `1fr` mobile. Links with external arrow icons. Social icons at 24px, color #6b7094 → white on hover.

### 2.10 Marquee Banner

```css
background-color: #4a3aff;
height: 40px;
overflow: hidden;
```

Text: uppercase, Satoshi 600, 0.875rem, white. Animation: `translateX(-50%) → translateX(0%)`, 40s linear infinite. Content duplicated for seamless loop.

### 2.11 p5.js Grid Reveal Animation

Canvas positioned absolute behind section content. Draws randomly appearing grid squares (40px cells) that fade out. Parameters:
- CELL_SIZE: 40px
- MAX_CELLS: 150
- REVEAL_INTERVAL: 1000ms
- Stroke: white at 1% opacity, Fill: white at 0.5% opacity
- Applied to: hero, section_wrapper_1, section_wrapper_2

### 2.12 Logo

The Tangle knot SVG uses a linear gradient:
- Start: #8E59FF
- End: #6888F9
- Two overlapping paths at different opacities (1.0 and 0.8)

---

## 3. Product UI Design System (ai.tangle.tools, apps)

### 3.1 Color System

**Primary palette** anchors on purple-to-indigo:

| Token | Hex | Usage |
|-------|-----|-------|
| `accent.500` | `#A855F7` | Primary actions, active states, focus rings |
| `accent.600` | `#9333EA` | Active border (light theme) |
| `accent.700` | `#7C3AED` | Sidebar button text (light theme) |
| Brand indigo | `#667eea` | Hero gradient start, code block top-border |
| Brand violet | `#764ba2` | Hero gradient end, code block top-border |

**Neutrals** — true grays, no chroma:

| Token | Light | Dark |
|-------|-------|------|
| `bg-depth-1` | white | gray.900 |
| `bg-depth-2` | gray.50 | gray.800 |
| `bg-depth-3` | gray.200 | gray.700 |
| `textPrimary` | gray.950 | white |
| `textSecondary` | gray.600 | gray.400 |
| `borderColor` | alpha.gray.10 | alpha.white.10 |

**Alpha system**: Every base color has a full alpha ramp. Buttons use `alpha.accent.10` bg, `alpha.accent.20` hover. Borders use `alpha.gray.10`. Never use opaque colored backgrounds for interactive states.

### 3.2 Typography

| Role | Family | Weights |
|------|--------|---------|
| UI text | Inter | 300, 400, 500, 700 |
| Code | JetBrains Mono | 400, 500 |

| Context | Size | Weight | Letter-spacing |
|---------|------|--------|----------------|
| Hero title | 2xl → 5xl responsive | 700 | default |
| Section h1 | 1.75em | 700 | -0.02em |
| Section h2 | 1.5em | 700 | -0.02em |
| Body | 15px | 400 | 0.005em |
| Code | 13px | 400-500 | default |

H1 gradient text: `linear-gradient(135deg, #667eea, #764ba2)` with `-webkit-background-clip: text`.

### 3.3 Border Radius Scale

| Context | Radius |
|---------|--------|
| Buttons, inputs | 6px (rounded-md) |
| Cards, code blocks | 8px (rounded-lg) |
| Dropdowns, dialogs | 16px (rounded-2xl) |
| Badges, pills | 9999px (rounded-full) |
| Inline code | 4px (rounded-sm) |

No rounded-xl (12px). The jump from 8px→16px is intentional hierarchy.

### 3.4 Animation

Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (deceleration). No bouncing.

| Speed | Duration | Usage |
|-------|----------|-------|
| Instant | 100ms | Color, opacity |
| Quick | 150-200ms | Hover, tooltips |
| Normal | 300ms | Sheet close, dropdown |
| Slow | 500ms | Sheet open, page transition |

### 3.5 Component Patterns

**Buttons**: 5 variants (Default/Secondary/Outline/Ghost/Destructive). font-medium, shadow-xs, rounded-md, gap-2.

**Cards**: rounded-lg, border, bg-card, shadow-sm. Hierarchy from depth tokens, not shadows.

**Inline code**: 4px radius, gradient background (`rgba(99,102,241,0.1)` to `rgba(139,92,246,0.1)`), 1px purple border.

**Dark mode**: Not inverted light mode. Background hsl(0,0%,9%), sidebar hsl(240,6%,6%). Purple accent stays at 500 (doesn't shift).

---

## 4. Shared Brand Elements

These apply across both contexts:

1. **Purple is computation, intelligence, protocol** — used for accents, not decoration
2. **Depth over elevation** — layered backgrounds, not drop shadows
3. **Precision** — tight spacing, consistent radii, aligned grids
4. **No warm grays, no blue-grays** — true neutral grays only
5. **Gradients are 2-stop only** — simplicity is the point
6. **Alpha colors for interactive states** — never opaque colored backgrounds
7. **Logo gradient**: #8E59FF → #6888F9

---

## 5. Anti-Patterns

| Never | Why |
|-------|-----|
| Opaque colored button backgrounds | Use alpha. Opaque doesn't compose across depths. |
| Bouncy/spring animations | Brand is deceleration curves, not physics. |
| Heavy drop shadows for hierarchy | Use depth tokens. Shadows for floating surfaces only. |
| Warm gray / blue-gray neutrals | True grays. No personality in neutrals. |
| More than 2 gradient stops | Brand gradient is always 2-stop. |
| Frosted glass (heavy blur) | Light blur only (4px). Heavy blur is a different brand. |
| Space Grotesk on marketing site | Use Satoshi. Space Grotesk is for the blog only. |
| Solid background on section wrappers | Must be transparent with radial-gradient overlay. |
| Centered hero text | Marketing heroes are LEFT-ALIGNED, 60% width, bottom-aligned. |
