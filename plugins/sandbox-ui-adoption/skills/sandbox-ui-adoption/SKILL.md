---
name: sandbox-ui-adoption
description: "Adopt the Tangle design system from @tangle-network/sandbox-ui (0.37.x) + @tangle-network/brand (0.4.x) in a product or generated app. The visual-layer analogue of agent-stack-adoption. Covers the Heading / PageHeader / SectionTitle / PageShell primitives, the role-to-size type scale, the one-h1-per-page rule, DashboardLayout in-app logo wiring, the Tangle Quiet dark theme, and the monorepo version-skew gate. Use when standing up a new product UI, auditing an app for hand-rolled titles, or wiring the brand tokens + tailwind preset."
---

# Sandbox UI Adoption — the Tangle design system

## Related skills — what to read when

| If you are... | Read |
|---|---|
| Adopting the VISUAL layer — type scale, primitives, theme, layout (this skill) | **THIS skill** |
| Adopting the AGENT layer — composer, traces, eval loop, MCP delegation | `agent-stack-adoption` (9-phase pipeline) + `agent-eval-adoption` (primitives) |
| Building product UI from scratch with no design system yet | `product-design` (reference-first, low-copy) — then come back here to wire the real tokens |

`agent-stack-adoption` makes the agent behave consistently. THIS skill makes
the product LOOK consistent. Same doctrine, different layer: there is exactly
one canonical source for every visual decision, and hand-rolling around it is
the cause of every drift mode below.

The system is two packages:

- **`@tangle-network/brand`** (peer, `^0.4.0`) — design tokens (`tokens.css`),
  the dark theme (`theme.css`), and `globals.css`, exported under
  `@tangle-network/brand/styles`. Tokens are CSS variables consumed through the
  sandbox-ui tailwind preset. This package owns the *values*.
- **`@tangle-network/sandbox-ui`** (`0.37.x`) — the React components that
  *consume* those tokens: typography primitives, `DashboardLayout`, chat,
  files, terminal, editor, etc. This package owns the *components*.

"Adopted" means: brand styles imported, the tailwind preset wired, every title
on every page is a `Heading`-family primitive (zero hand-rolled `text-3xl
font-extrabold`), the dashboard shell is `DashboardLayout` with an in-app logo
target, and the app verifies in BOTH light and the Tangle Quiet dark theme.

---

## Doctrine — the eight rules

These are hard-won. State them as rules, not suggestions.

### 1. Never hand-roll heading sizes

`<h1 className="text-3xl font-extrabold tracking-tight">` is the single largest
cause of cross-page inconsistency. Three engineers pick three sizes, three
weights, three tracking values for "the page title", and no two pages match.

Use the primitives. They live in `@tangle-network/sandbox-ui/primitives`:

```tsx
import { Heading, PageHeader, SectionTitle, PageShell } from "@tangle-network/sandbox-ui/primitives"

// A dashboard page title:
<PageHeader title="Sandboxes" description="Your running workspaces." action={<NewButton />} />

// A heading inside a page:
<SectionTitle title="Recent runs" />

// A raw role when you need full control of the tag/content:
<Heading role="page">Billing</Heading>
```

`PageHeader` already composes `eyebrow` + `page`-role title + description + a
right-aligned action slot. `SectionTitle` composes a `section`-role title +
description + action. Reach for the composite first; drop to `Heading` only
when you need the bare element.

### 2. The role→size map, and one h1 per page

`Heading` takes `role` (NOT a size). The role resolves size + weight + tracking
+ leading from one place:

| `role` | Size (token / fallback) | Default tag | Use for |
|---|---|---|---|
| `display` | `--font-size-display` / **3rem (~64px scale)** | `h1` | marketing hero headline |
| `hero` | `--font-size-hero` / **2.5rem (~36-40px)** | `h2` | secondary hero / large marketing section head |
| `page` | `--font-size-3xl` / **1.875rem (30px)** | `h1` | the page title (dashboard h1) |
| `section` | `--font-size-xl` / **1.25rem (20px)** | `h2` | section heading inside a page |
| `subsection` | `--font-size-lg` / **1rem (16px)** | `h3` | sub-section heading |
| `eyebrow` | `--font-size-sm` / **0.75rem (12px)**, uppercase | `p` | label above a title |

**One `<h1>` per page.** Both `display` and `page` default to `h1`. A marketing
page uses `display` for the hero. A dashboard page uses `page` for the title.
If a single page needs both (rare), keep ONE as `h1` and override the other
with `as`:

```tsx
<Heading role="display">Build agents in a sandbox</Heading>      {/* the h1 */}
<Heading role="page" as="h2">Pricing</Heading>                    {/* demoted */}
```

`PageHeader` exposes `titleAs` for the same reason — set `titleAs="h2"` when the
page already has a `display` h1 above the header.

### 3. The hero must dominate — and not depend on an unpublished token

brand@0.4.0 publishes only `--font-size-{sm,base,lg,xl}`. It does **not**
publish `--font-size-display`, `--font-size-hero`, or `--font-size-3xl`. The
`Heading` component therefore encodes the hero/display/page scale in its
*literal fallbacks* (`3rem` display, `2.5rem` hero, `1.875rem` page), and the
brand token, when it ships, only refines those.

Practical consequence: **the fallback must already encode the full hero scale.**
Never ship a hero whose size is gated on a brand token that isn't published yet
— if you do, the hero silently collapses to the browser default and the
marketing page looks broken on any consumer that hasn't pulled an unreleased
brand build. Trust the primitive's fallback; do not "improve" it by stripping
the literal and pointing at a token that doesn't resolve.

### 4. One PageShell per page

`PageShell` is the canonical page container — one max-width (`max-w-6xl`), one
gutter (`px-6 lg:px-8`), one vertical rhythm (`space-y-8 py-8`). Wrap page
content in it so every page sits on the same grid:

```tsx
import { PageShell, PageHeader } from "@tangle-network/sandbox-ui/primitives"

export default function SandboxesPage() {
  return (
    <PageShell>
      <PageHeader title="Sandboxes" description="Your running workspaces." />
      {/* ...content... */}
    </PageShell>
  )
}
```

Do not re-declare `max-w-*` / gutter / spacing per page — that re-introduces the
drift `PageShell` exists to kill.

### 5. The dashboard logo must never bounce a signed-in user to marketing

`DashboardLayout` (from `@tangle-network/sandbox-ui/dashboard`) defaults
`logoHref` to `'/'`. Inside an authenticated app, `'/'` is the public marketing
homepage — clicking the in-app logo logs the user out of their context. That is
a real bug, not a nit.

Pick ONE of:

```tsx
// (a) in-app destination — the logo navigates somewhere useful inside the app:
<DashboardLayout logoHref="/dashboard" navItems={...}>{children}</DashboardLayout>

// (b) sidebar toggle — the logo collapses/expands the labeled rail (no nav):
<DashboardLayout labeledRail navItems={...}>{children}</DashboardLayout>

// (c) custom action — onLogoClick takes precedence over logoHref; ALWAYS set
//     logoAriaLabel to describe what it actually does:
<DashboardLayout
  onLogoClick={openCommandPalette}
  logoAriaLabel="Open command palette"
  navItems={...}
>{children}</DashboardLayout>
```

`onLogoClick` > `labeledRail` > `logoHref` in precedence. Always pass an in-app
`logoHref`, or `labeledRail`, or `onLogoClick`. Never leave the default `'/'` in
an authenticated shell. Pass your router's link via `LinkComponent` so
client-side navigation works.

### 6. Dark theme is "Tangle Quiet"

The dark theme is flat and indigo-accent-only — NOT a neon, multi-hue dark
mode. Adoption rules:

- **Lift surfaces off pure black.** Backgrounds step up in even ~5% elevation
  increments (base → card → popover → raised), never `#000` slabs with floating
  white text.
- **Faint indigo cast** on elevated surfaces, not gray. The accent color is
  indigo — and it is the *only* accent. No secondary brand hues, no rainbow
  status colors beyond the semantic `destructive`/`primary` tokens.
- **Visible hairline borders.** Surfaces are separated by faint but real
  `border-border` hairlines, not by drop shadows alone — shadows mostly vanish
  on dark.
- **Quiet weights** (this is the typographic half of "Quiet"): heroes at 700,
  titles at 600. **Never extrabold.** The `Heading` primitive already enforces
  this; don't override `font-bold`/`font-extrabold` on top of a `Heading`.

Use the semantic tokens (`bg-background`, `bg-card`, `text-foreground`,
`text-muted-foreground`, `border-border`, `bg-primary`) — never raw hex. Those
tokens are what flip correctly between light and Tangle Quiet.

### 7. Version-skew discipline (a real failure we hit)

In a monorepo, **every consumer must share ONE `@tangle-network/sandbox-ui`
version.** Two apps on two minors render two different design systems, and the
ecosystem-skew gate fails CI.

- **One version across the workspace.** Pin sandbox-ui to a single version in
  every consumer `package.json`. Use a `pnpm.overrides` entry to collapse
  transitive duplicates if a dependency ghosts a different minor through its
  peer range.
- **Regenerate the lockfile in the SAME change as the bump.** Bump a dep
  without committing the updated `pnpm-lock.yaml` and frozen-install CI
  (`pnpm install --frozen-lockfile`) fails on the next run. Lockfile and
  `package.json` move together, always.
- **Don't bump a consumer to a sandbox-ui version that pins an unpublished
  brand peer.** sandbox-ui declares `@tangle-network/brand` as a peer
  (`^0.4.0`). If you adopt a sandbox-ui build whose brand peer range only
  resolves against an unreleased brand version, install breaks (or worse,
  resolves to a stale brand and the tokens silently mismatch — see Doctrine 3).
  Verify the brand peer is satisfiable by a *published* version before bumping.

### 8. The adoption checklist (copy-paste)

```text
[ ] 1. Install peers + the component lib:
       pnpm add @tangle-network/sandbox-ui @tangle-network/brand
       # plus the brand's own peers: @tangle-network/ui, react, react-dom,
       # @tangle-network/agent-interface (see sandbox-ui peerDependencies)
[ ] 2. Wire the tailwind preset (tailwind.config.cjs / .ts):
       presets: [require("@tangle-network/sandbox-ui/tailwind")]
[ ] 3. Import brand styles ONCE at the app root (layout.tsx / _app / main.tsx):
       import "@tangle-network/brand/styles"           // tokens + theme + globals
       // (or sandbox-ui/styles, which re-exports the bundled CSS)
[ ] 4. Replace every hand-rolled title with a primitive:
       grep -rnE 'text-(2xl|3xl|4xl|5xl)|font-extrabold' src/  → convert to
       <Heading role=...> / <PageHeader> / <SectionTitle>
[ ] 5. Wrap each page body in <PageShell>.
[ ] 6. Wire DashboardLayout with an in-app logo (logoHref / labeledRail /
       onLogoClick) and LinkComponent={YourRouterLink}.
[ ] 7. Verify in BOTH light and dark (toggle `class="dark"` on <html>):
       headings match the role→size table, surfaces lift off black with
       hairline borders, indigo is the only accent, weights are 600/700.
[ ] 8. Confirm ONE sandbox-ui version across the workspace and the lockfile
       is regenerated in this change: pnpm install --frozen-lockfile passes.
```

---

## Anti-patterns

Each is caught in at least one real adoption. The fix is always "use the
primitive / token, don't hand-roll."

1. **Hand-rolled title classes** — `text-3xl font-extrabold` per page. Every
   page drifts. Fix: `Heading` / `PageHeader` / `SectionTitle` (Doctrine 1-2).
2. **Two h1s per page** — `display` AND `page` both rendered as `h1`. Breaks
   a11y + SEO. Fix: one `h1`, demote the other with `as` / `titleAs` (Doctrine 2).
3. **Hero gated on an unpublished token** — sizing a hero off
   `--font-size-hero` while assuming a brand version that doesn't ship it. Hero
   collapses to browser default. Fix: trust the primitive's literal fallback
   (Doctrine 3).
4. **Per-page max-width / gutter** — re-declaring `max-w-*` and padding on every
   page. Fix: one `PageShell` (Doctrine 4).
5. **Logo → marketing homepage** — leaving `logoHref` at its `'/'` default in an
   authenticated shell, bouncing signed-in users out of context. Fix:
   `logoHref` (in-app) / `labeledRail` / `onLogoClick` (Doctrine 5).
6. **Neon dark mode** — pure-black slabs, multiple accent hues, no borders. Fix:
   Tangle Quiet — ~5% elevation steps, faint indigo cast, hairline borders,
   indigo-only accent (Doctrine 6).
7. **Extrabold headings** — overriding `font-bold`/`font-extrabold` on a
   `Heading`. Fix: leave the primitive's quiet weights (600 titles / 700 heroes).
8. **Raw hex / arbitrary colors** — `bg-[#0a0a0a]`, `text-white`. Doesn't flip
   between themes. Fix: semantic tokens (`bg-background`, `text-foreground`, …).
9. **Mixed sandbox-ui versions across the monorepo** — two apps, two minors,
   two design systems; ecosystem-skew gate fails. Fix: one version + overrides
   (Doctrine 7).
10. **Bump without lockfile regen** — `package.json` bumped, `pnpm-lock.yaml`
    not committed; frozen-install CI fails. Fix: regenerate the lockfile in the
    same change (Doctrine 7).

---

## Subagent invocation

When a subagent is asked to "adopt the Tangle design system in `<product>`":

1. **Read this skill** (loaded automatically when the `/sandbox-ui-adoption`
   slug is invoked).
2. **Audit current state.** Run the checklist as an audit:
   - `grep -rnE 'text-(2xl|3xl|4xl|5xl)|font-extrabold' <app>/src` — every hit
     is a hand-rolled title to convert.
   - Check the app root imports `@tangle-network/brand/styles` and the tailwind
     config uses the sandbox-ui preset.
   - Check `DashboardLayout` usage for a default-`'/'` logo.
   - Check every consumer `package.json` pins the SAME sandbox-ui version.
3. **Fix in checklist order** (deps → preset → styles → primitives → PageShell →
   DashboardLayout → verify light+dark → version/lockfile).
4. **Verify in both themes.** Headings match the role→size table, surfaces lift
   off black with hairline borders, indigo is the only accent.
5. **Report state at end:** which checklist items pass, the count of
   hand-rolled titles converted, any version-skew found, and the light/dark
   verification result.

---

## Key API surface

- `@tangle-network/sandbox-ui/primitives` — `Heading` (props: `role:
  'display' | 'hero' | 'page' | 'section' | 'subsection' | 'eyebrow'`, `as?`,
  forwarded ref + standard HTML/ARIA/`data-*` attrs), `PageHeader`
  (`title` / `description` / `eyebrow` / `action` / `titleAs`), `SectionTitle`
  (`title` / `description` / `action`), `PageShell`, type `HeadingVariant`
  (`HeadingRole` is a deprecated alias).
- `@tangle-network/sandbox-ui/dashboard` — `DashboardLayout` (logo props:
  `logoHref` default `'/'` — pass an in-app path; `onLogoClick`;
  `logoAriaLabel`; `labeledRail` — rail logo toggles the sidebar; plus
  `LinkComponent`, `navItems`, `modeItems`, `panels`, `user`, …).
- `@tangle-network/sandbox-ui/styles` — bundled `styles.css` (also
  `/globals.css`, `/tokens.css`); `@tangle-network/sandbox-ui/tailwind` — the
  tailwind preset.
- `@tangle-network/brand@^0.4.0` (peer) — `./styles` (`tokens.css`,
  `theme.css`, `globals.css`). Owns the CSS-variable token values; dark theme is
  Tangle Quiet. Published font-size tokens: `--font-size-{sm,base,lg,xl}`. The
  display/hero/3xl scale lives in the `Heading` primitive's literal fallbacks
  (Doctrine 3).
