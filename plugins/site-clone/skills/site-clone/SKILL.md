---
name: site-clone
description: "Clone/migrate a website from any platform (Webflow, WordPress, Squarespace, etc.) to a self-hosted framework (Astro, Next.js, Vite). Produces a pixel-perfect 1:1 reproduction by ripping the actual CSS, fonts, assets, and DOM structure from the live site. Use when the user says 'clone this site', 'migrate from webflow', 'rebuild this site', 'copy this website', 'replicate this site', or any variant of website migration/cloning."
---

# Site Clone — Pixel-Perfect Website Migration

You are performing a complete website migration. The goal is a 1:1 reproduction that is indistinguishable from the original. "Close enough" is not acceptable — use the actual CSS values, actual fonts, actual assets, and actual DOM structure from the source site.

## Inputs

The user will provide:
- **Source URL** — the live site to clone
- **Target framework** — Astro (default), Next.js, Vite+React, etc.
- **Hosting target** — Cloudflare Pages (default), Vercel, Netlify, etc.
- **Optional: Webflow/platform asset export** — if available, use these as the source of truth for images

If not specified, default to **Astro + Tailwind + Cloudflare Pages** (static, zero-cost).

## Phase 1: Reconnaissance (parallel)

Run ALL of these simultaneously:

### 1a. Rip the live site
Write and execute a Playwright script that for EVERY page:
- Downloads the **complete rendered HTML** (post-JS execution)
- Extracts **all `<link rel="stylesheet">` URLs** and downloads them
- Extracts **all inline `<style>` blocks**
- Extracts **computed styles** for key elements (h1-h6, nav, buttons, cards, sections, footer)
- Downloads **every image** (img src, srcset, CSS background-image)
- Extracts **all inline SVGs**
- Extracts **all font files** from @font-face rules in CSS
- Takes a **full-page screenshot** at 1440px width
- Saves page HTML for DOM structure reference

### 1b. Discover the site map
Either via the rip script or separately:
- Extract all internal links from nav, footer, and page body
- Build a complete URL list
- Note which pages share layouts vs. have unique structures

### 1c. Extract the design system from CSS
Parse the downloaded CSS to extract:
- **`:root` CSS custom properties** — these define the theme
- **Font families** — the ACTUAL fonts used (not what you'd guess from looking)
- **Color palette** — from CSS variables and computed values
- **Spacing scale** — padding/margin values
- **Border radius values**
- **Box shadows**
- **Transitions/animations**
- **Breakpoints** from @media queries

### 1d. Ask for platform asset export (if applicable)
If the source is Webflow/Squarespace/WordPress, ask the user to export assets from the platform dashboard. These are higher quality than ripped versions.

## Phase 2: Analyze (before writing ANY code)

Review the ripped data and create a mental model:

1. **Identify the actual font stack** — look at CSS, not screenshots. The font is often NOT what you'd guess (e.g., Satoshi vs Space Grotesk).
2. **Identify the actual background color** — extract from `:root` or `body` CSS, not from eyeballing screenshots.
3. **Map the section structure** — how does the original DOM nest? What are the class names? What's the grid/flex structure?
4. **Catalog all unique components** — buttons (how many variants?), cards, nav, footer, CTAs, accordions, carousels.
5. **Identify animations** — marquees, scroll triggers, hover effects, transitions.

## Phase 3: Scaffold

1. Create the project with the target framework
2. Copy ALL assets from the rip/export into `public/images/` (use original filenames)
3. Copy the actual font files into `public/fonts/`
4. Set up `@font-face` declarations using the ACTUAL font names from the CSS

## Phase 4: Build the Design System CSS

**THIS IS THE CRITICAL STEP.** Do NOT approximate. Do NOT use "similar" Tailwind classes.

1. Extract every CSS class from the original site that defines visual style
2. Create a CSS file with those EXACT classes, using the EXACT values from the ripped CSS
3. Prefix with `wf-` (or similar) to namespace them
4. Include responsive breakpoints from the original `@media` queries
5. Include hover states, transitions, and animations

The CSS should be a faithful translation of the original — same values, same structure, same selectors — just cleaned up and organized.

## Phase 5: Build Pages

For each page:
1. Open the ripped HTML
2. Study the DOM structure
3. Rebuild in the target framework using the SAME nesting structure
4. Apply the extracted CSS classes
5. Reference images using the original filenames from `public/images/`
6. Verify the build passes

## Phase 6: Visual Comparison

Take screenshots of the built pages and compare against the originals side-by-side. Fix any discrepancies.

## Key Principles

### What makes the difference between 50% and 95%:

| 50% (Walmart ripoff) | 95% (Pixel-perfect) |
|---|---|
| Guess the font from screenshots | Extract actual font from CSS/font files |
| Eyeball colors | Use exact hex from `:root` variables |
| Invent your own layout | Mirror the actual DOM structure |
| Use placeholder images | Use original assets |
| Approximate spacing with Tailwind | Use exact px/rem values from CSS |
| Skip animations | Replicate transitions and keyframes |
| Generic border-radius | Exact border-radius per element |

### Common pitfalls to AVOID:
- **Wrong font** — Always check CSS, never assume
- **Wrong background color** — `#1f1d2b` vs `#0b0b1e` looks "close" but feels completely different
- **Missing subtle borders** — e.g., `border: 1px solid #211a41` on sections
- **Missing gradients** — radial gradients on section backgrounds are invisible but add depth
- **Wrong button padding** — `20px 38px` vs `12px 24px` changes the entire feel
- **Missing opacity** — text at `opacity: 0.6` vs full white is a huge difference
- **Missing letter-spacing** — `-0.02em` on nav links is subtle but contributes to feel
- **Hero height** — `95vh` vs `100vh` vs arbitrary padding changes the impact

### Order of operations for maximum fidelity:
1. Get the fonts right FIRST
2. Get the colors right from CSS variables
3. Get the layout structure from DOM
4. Get the spacing from computed styles
5. Get the assets from the export
6. Get the animations last

## Deliverables

- Complete, building project in target framework
- All pages rendered with original content
- All original assets (images, fonts, SVGs) included
- CSS that faithfully reproduces the original design
- Deployment config for target host
- Preview server running for user inspection

## Usage

```
/site-clone https://example.com
/site-clone https://example.com --framework nextjs --host vercel
```
