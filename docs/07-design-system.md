# TFRS Tactical Command Deck Design System

## Purpose

All generated UI must feel like TFRS: industrial, tactical, high-contrast, data-forward, and command-deck oriented.

## Principles

1. Command first.
2. Industrial clarity.
3. High contrast.
4. Data tactility.
5. Motion with purpose.
6. Accessibility remains mandatory.

## Core palette

| Token | Value | Usage |
|---|---|---|
| `--tfrs-bg` | `#080d14` | App background |
| `--tfrs-bg-elevated` | `#0d1520` | Cards/panels |
| `--tfrs-surface` | `#111c29` | Secondary panels |
| `--tfrs-surface-2` | `#182536` | Raised controls |
| `--tfrs-border` | `#26384f` | Default border |
| `--tfrs-border-strong` | `#3b526f` | Active border |
| `--tfrs-red` | `#c00a14` | Primary command accent |
| `--tfrs-red-bright` | `#ef1d2d` | Hover/active red |
| `--tfrs-gold` | `#c9a84c` | Premium/status accent |
| `--tfrs-steel` | `#7f93ad` | Muted/body text |
| `--tfrs-ink` | `#e6edf6` | Primary text |
| `--tfrs-success` | `#2fd17c` | Positive status |
| `--tfrs-warning` | `#f7b731` | Warning status |

## Tailwind mapping

Config-style projects:

```js
theme: {
  extend: {
    colors: {
      tfrs: {
        bg: "#080d14",
        elevated: "#0d1520",
        surface: "#111c29",
        surface2: "#182536",
        border: "#26384f",
        red: "#c00a14",
        redBright: "#ef1d2d",
        gold: "#c9a84c",
        steel: "#7f93ad",
        ink: "#e6edf6"
      }
    }
  }
}
```

CSS-token-first projects:

```css
@theme {
  --color-tfrs-bg: #080d14;
  --color-tfrs-elevated: #0d1520;
  --color-tfrs-surface: #111c29;
  --color-tfrs-border: #26384f;
  --color-tfrs-red: #c00a14;
  --color-tfrs-red-bright: #ef1d2d;
  --color-tfrs-gold: #c9a84c;
  --color-tfrs-steel: #7f93ad;
  --color-tfrs-ink: #e6edf6;
}
```

## Typography

| Element | Class pattern |
|---|---|
| Display heading | `font-sans font-black uppercase tracking-wider` |
| Section heading | `font-sans font-extrabold uppercase tracking-wide` |
| Body text | `font-sans text-sm leading-relaxed` |
| Technical metadata | `font-mono text-xs uppercase tracking-widest` |
| Numeric telemetry | `font-mono tabular-nums` |
| CTA | `font-sans font-black uppercase tracking-wider` |

## Layout

- Use dense responsive grids.
- Prefer `rounded-sm`.
- Use tactical panel boundaries.
- Keep interactions tactile and visible.

## Component examples

### Tactical card

```tsx
<Card className="rounded-sm border border-tfrs-border bg-tfrs-elevated text-tfrs-ink">
  <CardHeader className="border-b border-tfrs-border">
    <p className="font-mono text-xs uppercase tracking-widest text-tfrs-gold">System</p>
    <CardTitle className="font-black uppercase tracking-wider">Mission Panel</CardTitle>
  </CardHeader>
  <CardContent className="p-4 text-tfrs-steel" />
</Card>
```

### Command button

```tsx
<Button className="rounded-sm bg-tfrs-red px-5 py-3 font-black uppercase tracking-wider text-white hover:bg-tfrs-red-bright">
  Execute
</Button>
```

## Accessibility rules

- Do not rely on color alone.
- Preserve keyboard focus.
- Use semantic headings.
- Keep Radix ARIA behavior intact.
- Respect reduced-motion preferences.
- Check contrast after every theme adaptation.

## Review checklist

- Uses TFRS palette.
- Uses tactical uppercase headings where appropriate.
- Uses `font-mono` for metadata/specs.
- Uses blocky grids and crisp borders.
- Avoids generic gray/blue SaaS look.
- Avoids unapproved global CSS.
- Preserves accessibility.
