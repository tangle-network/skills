# Tangle Design System

Design tokens and component patterns extracted from the Tangle marketing site (~/company/website-migration). Use this as the canonical reference for all Tangle-branded products.

## Colors

### Brand Gradient
```
Primary gradient: #8E59FF → #6888F9 (purple-to-blue)
Used in: logo, accent text, hover states, glows
```

### Backgrounds (Dark Theme — default, no light mode)
```css
--bg-root:      #000000     /* HTML/body */
--bg-dark:      #1f1d2b     /* Main background */
--bg-card:      #161425     /* Card surfaces */
--bg-elevated:  #1e1c30     /* Elevated sections */
--bg-section:   #171528     /* Section containers */
--bg-input:     #141428     /* Input fields, code blocks */
```

### Text
```css
--text-primary:   #ffffff
--text-secondary: #aab0bc
--text-muted:     #6b7094
```

### Brand Colors
```css
--brand-primary:  #605dba   /* Indigo */
--brand-strong:   #6941c6   /* Violet bold */
--brand-cool:     #6172f3   /* Bright blue */
--brand-glow:     #9e77ed   /* Violet glow */
--brand-purple:   #7f56d9   /* Medium purple */
--brand-soft:     #f0f0f8   /* Light lavender (rare) */
```

### Borders
```css
--border-subtle:  rgba(255, 255, 255, 0.06)
--border-default: rgba(255, 255, 255, 0.08)
--border-hover:   rgba(255, 255, 255, 0.1)
--border-accent:  rgba(142, 89, 255, 0.2)
--border-accent-hover: rgba(142, 89, 255, 0.4)
```

### Buttons
```css
/* Primary */
--btn-primary-bg:    #1e116e
--btn-primary-hover: #281ca5
--btn-primary-text:  #ffffff

/* CTA (white) */
--btn-cta-bg:    #ffffff
--btn-cta-text:  #1d1d1d
--btn-cta-hover: #f0f0f0
```

### Syntax / Code Colors
```css
--code-keyword:  #c084fc   /* Purple */
--code-string:   #a78bfa   /* Light purple */
--code-function: #60a5fa   /* Blue */
--code-number:   #fcd34d   /* Yellow */
--code-success:  #4ade80   /* Green */
--code-comment:  rgba(255, 255, 255, 0.25)
```

## Typography

### Fonts
| Role | Font | Fallback |
|------|------|----------|
| Headings + Body | **Satoshi** (variable, 300-900) | ui-sans-serif, system-ui |
| Secondary body | **Space Grotesk** (300-700) | sans-serif |
| Code | **JetBrains Mono** (400-700) | monospace |

### Type Scale
| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| H1 hero | 4.5rem | 800 | 120% |
| H2 section | 4rem | 700 | 120% |
| H3 subsection | 2.5rem | 700 | 120% |
| Body large | 1.4rem | 700 | 150% |
| Body | 1.25rem | 600 | 150% |
| Body small | 1rem | 500 | 150% |
| Nav links | 1.15rem | 500 | 1 |
| Code | 13px | 400 | 1.55 |
| Small/caption | 0.875rem | 500 | — |

## Spacing

### Common Values
```
Section padding: 5vw vertical, 3% horizontal
Card padding: 1.5rem–2rem
Button padding: 12px 24px (CTA) or 20px 38px (hero)
Gap (large): 2rem
Gap (medium): 1rem
Gap (small): 0.5rem
Container max-width: 80rem (1280px)
```

## Border Radius
```
Buttons: 48px (pill) or 50px (CTA)
Cards: 1.25rem–1.5rem
Code blocks: 12px
Inputs: 8px–12px
Badges/pills: 62.5rem (fully round)
Nav menu: 200px
Dropdowns: 16px
```

## Effects

### Glassmorphism
```css
backdrop-filter: blur(3px);        /* Nav */
backdrop-filter: blur(20px);       /* Dropdowns */
background: rgba(0, 0, 0, 0.4);   /* Nav bg */
```

### Glow / Shadow
```css
/* Card hover */
box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(142, 89, 255, 0.1);

/* Dropdown */
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);

/* Radial glow (section backgrounds) */
background: radial-gradient(ellipse at 70% 50%, rgba(130, 99, 255, 0.15), transparent 60%);
```

### Transitions
```css
--transition-fast: 0.15s ease;
--transition-default: 0.2s ease;
--transition-medium: 0.3s ease;
```

## Component Patterns

### Activity Step (Conductor-inspired)
For tool call rendering — each agent action as a discrete step:
```
┌─ [icon] Step label ─────────────────────────────────────┐
│  ○ Created file output/f1040.pdf                        │
│  ○ Ran: python tax_toolkit/form_utils.py                │
│  ○ Filled 47 fields on Form 1040                        │
└─────────────────────────────────────────────────────────┘
```
- Subtle left border (--border-accent)
- Collapsed by default, expandable
- Icon per step type (terminal, file, check)
- Muted text for timestamps

### Card
```css
background: var(--bg-card);
border: 1px solid var(--border-default);
border-radius: 1.25rem;
padding: 1.5rem;
transition: var(--transition-medium);
```
Hover: border → --border-accent, subtle purple glow shadow

### Code Block
```css
background: var(--bg-input);
border: 1px solid var(--border-accent);
border-radius: 12px;
font-family: 'JetBrains Mono';
font-size: 13px;
line-height: 1.55;
padding: 1rem;
```
With window chrome dots: #FF5F57, #FEBC2E, #8E59FF

### Badge/Pill
```css
border: 1px solid var(--border-accent);
background: rgba(255, 255, 255, 0.02);
border-radius: 62.5rem;
padding: 0.5rem 1rem;
font-size: 0.875rem;
```

## Layout: Tax Product Workspace (Conductor-inspired)

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Logo │ Session Name │ Credits │ Model │ Settings      │
├────────┬────────────────────────────────────┬───────────────────┤
│ Left   │ Center                             │ Right             │
│ Panel  │                                    │ Panel             │
│        │ Agent conversation                 │                   │
│ Files  │ + tool call activity steps         │ PDF Viewer        │
│ ├ docs │                                    │ — or —            │
│ ├ out  │ [Inspecting f1040 fields...]       │ Code Editor       │
│ └ src  │ [Running tax computation...]       │ — or —            │
│        │ [Generated 1040: 47 fields]        │ Audit Results     │
│ Forms  │                                    │                   │
│ ├ 1040 │ Agent: "Here's your return..."     │ [form preview]    │
│ ├ SchD │                                    │                   │
│ └ 8949 │                                    │                   │
│        ├────────────────────────────────────┤                   │
│        │ Terminal (collapsible)             │                   │
│        │ $ python form_utils.py fill 1040   │                   │
├────────┴────────────────────────────────────┴───────────────────┤
│  Input: [Attach] [Ask about your taxes...            ] [Send]   │
│  [Sonnet ▾] [Link docs ×2]                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Breakpoints
```
Desktop:  ≥992px (3-panel layout)
Tablet:   768–991px (2-panel, right collapses)
Mobile:   <768px (single panel, everything stacked)
```

## Reference Files
- Global CSS: ~/company/website-migration/tangle-website/src/styles/global.css
- Fonts: ~/company/website-migration/tangle-website/src/styles/fonts.css
- Components: ~/company/website-migration/tangle-website/src/components/ui/
- Brand assets: ~/company/website-migration/tangle-website/public/brand/
