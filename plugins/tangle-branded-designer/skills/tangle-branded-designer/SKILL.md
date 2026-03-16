---
name: tangle-branded-designer
description: Tangle Network brand design system — colors, typography, layout, component aesthetics, and visual language. Use when building, reviewing, or designing any Tangle-branded UI.
---

# Tangle Branded Designer

You are the lead designer for Tangle Network. Every visual decision must express the brand: technically sophisticated, crypto-native, developer-first, and unmistakably premium. No generic SaaS aesthetics. No Bootstrap energy. This is infrastructure for the decentralized future — the design must feel like it.

---

## 1. Brand Identity

**Tangle Network** builds decentralized infrastructure — blueprints, operators, services. The visual language communicates:

- **Precision**: Every pixel is intentional. Tight spacing, consistent radii, aligned grids.
- **Depth**: Layered backgrounds create spatial hierarchy. Never flat, never cluttered.
- **Controlled energy**: Purple gradients and glows suggest computation happening beneath the surface. Not flashy — purposeful.
- **Developer respect**: Monospace where it matters. Clean data density. No dumbing down.

**Brand positioning**: We sit between the raw technical credibility of terminal UIs and the polish of Vercel/Linear. Closer to Linear than to MetaMask.

---

## 2. Color System

### 2.1 Primary Palette

The brand anchors on a **purple-to-indigo gradient axis**. Purple is computation, intelligence, the protocol layer. Indigo is trust, depth, the infrastructure layer.

| Token | Hex | Usage |
|-------|-----|-------|
| `accent.500` | `#A855F7` | Primary actions, active states, focus rings, loader progress |
| `accent.600` | `#9333EA` | Active border color (light theme) |
| `accent.700` | `#7C3AED` | Sidebar button text, content accent (light theme) |
| Brand purple | `#8B5CF6` | List markers, run summary borders, inline code borders |
| Brand indigo | `#667eea` | Hero gradient start, h1 gradient start, code block top-border start |
| Brand violet | `#764ba2` | Hero gradient end, h1 gradient end, code block top-border end |
| Logo purple | `#8E59FF` | Logo primary fill |
| Logo blue | `#6888F9` | Logo secondary fill |
| Default accent | `#6b4dff` | Partner system default accent |

### 2.2 Neutral Scale

Neutrals are true grays with minimal chroma. No warm tinting. No blue-gray. Pure.

| Token | Light | Dark |
|-------|-------|------|
| `bg-depth-1` | `white` | `gray.900` |
| `bg-depth-2` | `gray.50` | `gray.800` |
| `bg-depth-3` | `gray.200` | `gray.700` |
| `bg-depth-4` | `alpha.gray.5` | `alpha.white.5` |
| `textPrimary` | `gray.950` | `white` |
| `textSecondary` | `gray.600` | `gray.400` |
| `textTertiary` | `gray.500` | `gray.500` |
| `borderColor` | `alpha.gray.10` | `alpha.white.10` |

**Key principle**: Borders and subtle backgrounds use **alpha values**, not opaque colors. This makes them composable across any background depth without color clashing.

### 2.3 Semantic Colors

| Purpose | Color |
|---------|-------|
| Success | `green.500` (light) / `green.400` (dark) |
| Error / Destructive | `red.500` (light) / `red.400` (dark) |
| Warning | `orange` scale |
| Info / Links | `accent.500` (both themes) |

### 2.4 Alpha System

Every base color has a full alpha ramp (1% through 100%). This is the secret to the layered depth aesthetic:
- Buttons use `alpha.accent.10` background, `alpha.accent.20` hover
- Items use `alpha.gray.5` active background
- Borders use `alpha.gray.10` or `alpha.white.10`
- Run summaries use `rgba(139, 92, 246, 0.04)` — barely-there purple wash

**Never use opaque colored backgrounds for interactive states.** Always alpha.

### 2.5 Dark Theme Philosophy

Dark mode is not inverted light mode. It has its own character:
- **Background**: `hsl(0, 0%, 9%)` — near-black, not gray
- **Sidebar**: `hsl(240, 6%, 6%)` — slightly cooler than the main background
- **Cards**: Same as background (no card elevation via color in dark)
- **Borders**: `alpha.white.10` — ghostly, minimal
- **Purple accent stays at 500** in dark (doesn't shift to 400 like red/green)
- **Prompt background**: `rgba(23, 23, 23, 0.85)` — glass over dark

---

## 3. Typography

### 3.1 Font Stack

| Role | Family | Weights | Rendering |
|------|--------|---------|-----------|
| UI text | **Inter** | 300 (light), 400 (regular) | `-webkit-font-smoothing: antialiased` |
| Code / Terminal | **JetBrains Mono** | 400 | `font-display: swap` |
| Fallback (Inter) | System with `size-adjust: 107%`, `ascent-override: 90%` | — | Prevents layout shift |
| Fallback (JetBrains) | System with `size-adjust: 97%`, `ascent-override: 103%` | — | Prevents layout shift |

### 3.2 Type Scale

| Context | Size | Weight | Letter-spacing |
|---------|------|--------|----------------|
| Hero title | `2xl` → `5xl` responsive | 700 (bold) | default |
| Hero subtitle | `xs` → `lg` responsive | 400 | default |
| Section headings (h1) | `1.75em` | 700 | `-0.02em` (tight) |
| Section headings (h2) | `1.5em` | 700 | `-0.02em` |
| Body / Markdown | `15px` | 400 | `0.005em` |
| Line height (body) | `1.55` | — | — |
| Line height (headings) | `1.3` | — | — |
| Code (inline + blocks) | `13px` | 500 (inline), 400 (block) | default |
| Labels / helpers | `text-sm` (14px) | `font-medium` (500) | default |
| Buttons | default varies by size | `font-medium` | default |

### 3.3 Heading Treatment

H1 headings get gradient text:
```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

H1 and H2 get bottom borders (`2px` and `1px` respectively) using `borderColor` token.

---

## 4. Gradient Language

Gradients are the brand's visual signature. They appear at specific touchpoints, never gratuitously.

### 4.1 Primary Gradient (Hero / Brand)

```
linear-gradient(135deg, #667eea 0%, #764ba2 100%)
```
**Direction**: 135deg (top-left to bottom-right). This diagonal energy feels dynamic without being aggressive.

**Used in**: Hero backgrounds, h1 text fill, code block top accent bars, blockquote left borders.

### 4.2 Subtle Wash Gradients

```
linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05))
```
**Used in**: Artifact containers, table header backgrounds, inline code backgrounds (at 0.1 opacity).

These are barely perceptible — they add warmth and brand coherence without drawing attention.

### 4.3 Glow

```
rgba(102, 126, 234, 0.18)
```
**Used in**: Hero section glow, focus ring shadows. Soft indigo halo. Never harsh, never large radius.

Focus rings on interactive elements:
```css
box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.15);
```

### 4.4 Code Block Accent

Every code block gets a **3px gradient top border**:
```css
background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
```
This is horizontal (90deg), not diagonal — it acts as a structural accent, not a decorative gradient.

---

## 5. Spacing & Layout

### 5.1 Spacing Scale

Use the Tailwind/UnoCSS 4px base grid. Key recurring values:

| Token | Value | Usage |
|-------|-------|-------|
| `gap-1.5` | 6px | Tight groupings (icon + label) |
| `gap-2` | 8px | Button content, badge padding |
| `gap-3` | 12px | Card content spacing |
| `gap-4` | 16px | Section spacing, padding |
| `p-1.5` | 6px | Small interactive targets |
| `p-3` | 12px | Card padding, input padding |
| `p-4` | 16px | Dialog content, section padding |
| `p-6` | 24px | Large container padding |

### 5.2 Container Widths

| Container | Max Width |
|-----------|-----------|
| Chat container | `2100px` |
| Hero content | `max-w-6xl` (1152px) |
| Chat gutter | `8px` mobile → `12px` lg+ |

### 5.3 Heights

| Element | Height |
|---------|--------|
| Header | `64px` desktop, `56px` mobile |
| Button (sm) | `h-8` (32px) |
| Button (default) | `h-9` (36px) |
| Button (lg) | `h-10` (40px) |
| Input | `h-9` (36px) |
| Checkbox | `h-4` (16px) |
| Switch | `h-6` (24px) |
| Icon button | `size-8` to `size-10` |

### 5.4 Responsive Philosophy

Mobile-first with three meaningful breakpoints:
- **Default** (mobile): Single column, reduced header, tighter gutters
- **`sm` (640px)**: Minor spacing adjustments
- **`lg` (1024px)**: Side-by-side layouts (chat + workbench), expanded gutters
- **`xl+`**: Max-width containers kick in

Sidebar collapses at `880px`. Below that, it becomes a slide-out sheet.

---

## 6. Border Radius

Consistent, deliberate rounding. Nothing perfectly round unless it's a badge/avatar.

| Context | Radius | Token |
|---------|--------|-------|
| Buttons, inputs | `6px` | `rounded-md` |
| Cards, code blocks, tables | `8px` | `rounded-lg` |
| Dropdown menus, dialogs | `16px` | `rounded-2xl` |
| Badges, pills, avatars | `9999px` | `rounded-full` |
| Inline code | `4px` | `rounded-sm` |
| Blockquotes (right side) | `4px` | `rounded-r` |
| Focus outlines | `4px` | hardcoded |

**No `rounded-xl` (12px) in the system.** The jump from 8px to 16px is intentional — it creates clear hierarchy between content containers and overlay surfaces.

---

## 7. Shadow System

Shadows are minimal and purposeful. Dark mode shadows are stronger to compensate for reduced contrast.

| Level | Light | Dark |
|-------|-------|------|
| `shadow-xs` | Subtle input/button lift | Same |
| `shadow-sm` | Cards, tab active state | Same |
| `shadow-md` | Dropdowns | Same |
| `shadow-lg` | Dialogs | Same |
| Dropdown custom | `0 8px 30px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)` | `0 8px 30px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)` |
| Code block | `0 2px 8px rgba(0,0,0,0.05)` | — |
| Table | `0 1px 3px rgba(0,0,0,0.1)` | — |

---

## 8. Animation & Motion

### 8.1 Easing

Standard easing: `cubic-bezier(0.4, 0, 0.2, 1)` (aliased as `bolt-ease-cubic-bezier`).

This is a deceleration curve — elements arrive quickly and settle naturally. No bouncing, no overshoot. Professional, not playful.

### 8.2 Duration Scale

| Speed | Duration | Usage |
|-------|----------|-------|
| Instant | `100ms` | Color changes, opacity |
| Quick | `150-200ms` | Hover states, fade-in, tooltips |
| Normal | `300ms` | Sheet close, dropdown open |
| Slow | `500ms` | Sheet open, page transitions |

### 8.3 Named Animations

| Name | Behavior | Duration |
|------|----------|----------|
| `fade-in` | Opacity 0→1 | 200ms |
| `fadeInRight` | TranslateX(20px) + opacity | 200ms, cubic-bezier |
| `fadeMoveDown` | TranslateY(-8px) + opacity | 150ms, cubic-bezier |
| `card-enter` | TranslateY(12px) + opacity | 300ms |
| `shimmer` | Background position slide | 2s, infinite |
| `glow-pulse` | Opacity 0.6→1→0.6 | infinite, ease-in-out |
| `border-rotate` | 360deg CSS variable rotation | infinite |
| `btn-shine` | Background position sweep | 600ms |
| `file-flash` | Opacity pulse 0→10%→100% | 1s |

### 8.4 Transition Patterns

Theme transitions use a specific subset to avoid flicker:
```
transition: background-color, border-color, color
```

Dialog/sheet enter/exit:
```
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95
```

Stagger pattern for hero content: `animation-delay-200` on subtitle (200ms after title).

---

## 9. Component Aesthetic

### 9.1 Buttons

Five variants, each with clear visual hierarchy:

| Variant | Background | Text | Hover |
|---------|-----------|------|-------|
| **Default (primary)** | `primary` (purple) | White | `primary/90` (darkened) |
| **Secondary** | `secondary` (gray) | `secondary-foreground` | `secondary/80` |
| **Outline** | Transparent | Current color | `accent` bg |
| **Ghost** | Transparent | Current color | `accent` bg |
| **Destructive** | `destructive` (red) | White | `destructive/90` |

All buttons: `font-medium`, `shadow-xs`, `rounded-md`, `disabled:opacity-50`, `gap-2` for icon+text.

**Primary accent buttons** (sidebar, CTA) use the alpha system:
- Background: `alpha.accent.10`
- Hover: `alpha.accent.20`
- Text: `accent.500` (dark) / `accent.700` (light)

This is the "ghost purple" treatment — the signature Tangle button style.

### 9.2 Cards

- `rounded-lg` border, `border` color from token, `bg-card` background
- `shadow-sm` on cards
- Subcomponents: Header (with grid layout), Title, Description, Action, Content, Footer
- Header uses CSS container queries for responsive action placement
- **No card elevation difference between light and dark** — hierarchy comes from border and background depth tokens

### 9.3 Inputs

- `h-9`, `rounded-md`, `border`, `bg-transparent`
- `shadow-xs` for subtle lift
- Focus: `border-ring ring-ring/50 ring-[3px]`
- Error: `border-destructive ring-destructive/20`
- Placeholder: `text-muted-foreground`

### 9.4 Dialogs / Modals

- Fixed center, `rounded-2xl` (16px), `shadow-lg`
- Overlay: `bg-black/50` with `backdrop-blur-sm` (light blur, not frosted glass)
- Max width: `32rem` default
- Close button: top-right, ghost icon button
- Enter: fade + zoom-in-95. Exit: fade + zoom-out-95.

### 9.5 Dropdowns

- `rounded-2xl` (16px) — more rounded than cards, signaling "overlay surface"
- Custom shadow (dual-layer, see shadow system)
- Items: `rounded-sm`, `text-sm`, hover `bg-accent`
- Separator: `bg-border`, `h-px`, `-mx-1`
- Enter: `fade-in-0 zoom-in-95`. Exit: `fade-out-0 zoom-out-95`.

### 9.6 Tooltips

- Zero delay (instant appearance)
- `fade-in-0 zoom-in-95` enter animation
- `bg-primary text-primary-foreground` (dark tooltip on any background)
- `rounded-md`, `text-xs`, tight padding

### 9.7 Tables

- `border-collapse: separate` with `border-spacing: 0` for clean radius
- Headers: subtle gradient wash (`rgba(99, 102, 241, 0.1)` to `rgba(139, 92, 246, 0.1)`)
- Striped rows: `rgba(99, 102, 241, 0.02)` — barely visible purple tint
- Hover: `rgba(99, 102, 241, 0.05)` — slightly more visible
- `rounded-lg` container with overflow hidden

### 9.8 Inline Code

```css
border-radius: 4px;
padding: 0.15em 0.4em;
background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
border: 1px solid rgba(139, 92, 246, 0.2);
font-weight: 500;
```

This subtle gradient background with a faint purple border is a signature treatment. Inline code looks **embedded**, not just highlighted.

### 9.9 Blockquotes

```css
border-left: 4px solid;
border-image: linear-gradient(180deg, #667eea 0%, #764ba2 100%) 1;
background: linear-gradient(90deg, rgba(99, 102, 241, 0.05) 0%, transparent 100%);
font-style: italic;
```

The gradient left border + gradient background fade is distinctive. The gradient is vertical on the border (180deg) and horizontal on the background (90deg) — they cross-hatch for visual interest.

### 9.10 Lists

Custom markers replace default bullets:
- **UL Level 1**: `#8B5CF6` purple bullet (`•`)
- **UL Level 2**: `#A855F7` lighter purple (`◦`)
- **UL Level 3**: `#C084FC` lightest purple (`▪`)
- **OL**: Purple numbered with `counter()`, nested uses `counter.subcounter` format

---

## 10. Icon System

### 10.1 Libraries

| Library | Prefix | Usage |
|---------|--------|-------|
| **Phosphor** (primary) | `i-ph:` | All UI icons — 180+ in safelist |
| **Lucide React** | Direct import | Component icons (ChevronDown, X, Check) |
| **VS Code Icons** | `i-vscode-icons:` | File tree icons |
| **Custom Bolt** | `i-bolt:` | Product-specific icons from SVGs |

### 10.2 Icon Sizing

- Default in buttons: `size-4` (16px)
- Icon buttons: Container `size-8` to `size-10`, icon inherits
- Always: `pointer-events-none`, `shrink-0`

### 10.3 Icon Colors

| Token | Light | Dark |
|-------|-------|------|
| `icon-primary` | `gray.950` | `white` |
| `icon-secondary` | `gray.600` | `gray.600` |
| `icon-tertiary` | `gray.500` | `gray.500` |
| `icon-success` | `green.500` | `green.400` |
| `icon-error` | `red.500` | `red.400` |

---

## 11. Glass & Depth Effects

### 11.1 Backdrop Blur

Used sparingly for overlay surfaces:
- Dialog overlay: `backdrop-blur-sm` (4px)
- Prompt area: Semi-transparent background + no blur (relies on opacity alone)
- Landing header: `backdrop-blur-md` to `backdrop-blur-xl` for sticky headers

### 11.2 Depth Layering

The `bg-depth-1` through `bg-depth-4` system creates spatial hierarchy without shadows:

```
depth-1: Page background (white / gray.900)
depth-2: Raised surface — cards, sidebar (gray.50 / gray.800)
depth-3: Inset surface — code blocks, secondary panels (gray.200 / gray.700)
depth-4: Subtle accent — hover states, tags (alpha.gray.5 / alpha.white.5)
```

This is the **additive depth model** — each layer adds density, not elevation. No drop shadows needed for hierarchy (shadows reserved for true overlays like dropdowns/dialogs).

---

## 12. Z-Index Architecture

Strict, documented layers. No arbitrary z-index values.

| Layer | z-index | Content |
|-------|---------|---------|
| Base content | 0 | Page flow |
| Prompt | 2 | Chat input area |
| Workbench | 3 | Editor/preview pane |
| Iframe overlay | 995 | Preview interaction capture |
| Port dropdown | 996 | Preview port selector |
| Logo / File breadcrumb | 998 | Persistent navigation |
| Max general | 999 | Generic overlay ceiling |
| Sidebar | 9999 | Mobile slide-out sidebar |
| Toast | 10000 | Notification toasts |

---

## 13. Accessibility

Non-negotiable. Every component must pass these:

- **Focus visible**: `3px solid accent` outline with `2px offset` + purple box-shadow
- **Input focus**: `2px solid accent` with `1px offset`
- **WCAG 2.4.7**: All interactive elements show focus ring on keyboard navigation
- **Disabled state**: `opacity-50` + `pointer-events-none` + `cursor-not-allowed`
- **Error state**: `border-destructive` + `ring-destructive/20` on `aria-invalid`
- **Prefers-reduced-motion**: Respect system setting (animations degrade gracefully)
- **Screen reader**: `sr-only` class for hidden labels, semantic HTML throughout

---

## 14. Partner Theming Architecture

The system supports per-partner color overrides while maintaining brand coherence.

### 14.1 Override Surface

Partners can customize:
- `accent` — primary brand color
- `accentForeground` — text on accent backgrounds
- `heroGradientFrom` / `heroGradientTo` — hero section gradient
- `glow` — ambient glow color

### 14.2 Defaults (When No Partner)

```typescript
{
  accent: '#6b4dff',
  accentForeground: '#ffffff',
  heroGradientFrom: '#667eea',
  heroGradientTo: '#764ba2',
  glow: 'rgba(102, 126, 234, 0.18)',
}
```

### 14.3 Principle

Partner colors replace the accent and hero gradient only. The neutral system, typography, spacing, component shapes, and animation language remain constant. The brand is in the bones (layout, motion, depth), not just the skin (color).

---

## 15. Anti-Patterns

Things that violate the Tangle aesthetic. Never do these:

| Anti-Pattern | Why |
|-------------|-----|
| Opaque colored backgrounds on buttons | Use alpha. Opaque colors look heavy and don't compose across depths. |
| `rounded-xl` (12px) | Not in the scale. Creates ambiguity between card (8px) and overlay (16px). |
| Bouncy/spring animations | Not the brand. Use deceleration curves, not physics simulations. |
| Heavy drop shadows for hierarchy | Use depth tokens. Shadows are for floating surfaces only. |
| Warm gray / blue-gray neutrals | True grays only. No personality in the neutrals. |
| Gradient text on body copy | Reserved for H1 headings only. |
| Frosted glass (heavy blur) | Light blur only (`backdrop-blur-sm`). Heavy blur is a different brand. |
| Neon/saturated accent glows | Glows use 15-18% opacity. Subtle ambient, not attention-grabbing. |
| More than 2 gradient stops | The brand gradient is always 2-stop. Simplicity is the point. |
| Color for hierarchy | Use depth, typography weight, and spacing. Color is for semantics (action, error, success). |

---

## 16. Design Decision Checklist

When building any new surface, verify:

1. **Does it use depth tokens for background hierarchy?** (not arbitrary gray values)
2. **Are interactive states using alpha colors?** (not opaque)
3. **Does it have the right border radius?** (md for inputs, lg for containers, 2xl for overlays)
4. **Are animations under 300ms for micro-interactions?** (500ms max for page-level)
5. **Is the purple accent used semantically?** (actions, focus, progress — not decoration)
6. **Does dark mode maintain its own character?** (not just inverted light mode)
7. **Are gradients at correct touchpoints?** (hero, headings, code accent, blockquote borders — nowhere else)
8. **Is typography using the correct weight/size from the scale?** (no ad-hoc sizes)
9. **Does it degrade gracefully without animations?** (reduced-motion check)
10. **Are z-indexes from the documented layer system?** (no arbitrary values)
