# Typography Handover

Final font choices for the app. Both are free on Google Fonts and are variable fonts.

| Role | Font | Used for |
|---|---|---|
| Display | **Bricolage Grotesque** | Logo, headlines, section titles, small UI labels |
| Serif | **Fraunces** | Body text, note content, quotes, italic accents |

There is no sans-serif body font. Fraunces handles all reading text.

Live specimen: https://claude.ai/artifact/YN49XP3tRd35cnJAPCioRv

## Loading the fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1&display=swap">
```

## Tokens

```css
:root {
  --font-display: "Bricolage Grotesque", "Arial Narrow", system-ui, sans-serif;
  --font-serif: "Fraunces", Georgia, "Times New Roman", serif;
}
```

## Display: Bricolage Grotesque

The spacing below was loosened on purpose. Tighter tracking made words run into each other and hurt readability. Do not go below these values.

| Style | Weight | `wdth` | `opsz` | letter-spacing | word-spacing | line-height |
|---|---|---|---|---|---|---|
| Hero / big headline | 800 | 78 | 96 | `-0.005em` | `0.08em` | `0.95` |
| Section title (~24px) | 700 | 85 | 32 | `0.005em` | `0.05em` | `1.2` |
| Subheads (~26px) | 400–800 | 85 | 48 | `0.005em` | `0.05em` | `1.2` |
| Small label (uppercase, ~12px) | 600 | 100 | 12 | `0.1em` | — | — |
| Meta text (~13px) | 500 | 100 | 12 | `0` | — | — |

```css
.display-xl {
  font-family: var(--font-display);
  font-weight: 800;
  font-variation-settings: "wdth" 78, "opsz" 96;
  letter-spacing: -0.005em;
  word-spacing: 0.08em;
  line-height: 0.95;
  text-wrap: balance;
}
.display-md {
  font-family: var(--font-display);
  font-weight: 700;
  font-variation-settings: "wdth" 85, "opsz" 32;
  letter-spacing: 0.005em;
  word-spacing: 0.05em;
}
```

## Serif: Fraunces

Keep `WONK` at 0 for body text so it stays calm. Use the softer, wonkier settings only for italics and quotes.

| Style | Weight | `opsz` | `SOFT` | `WONK` | Size | line-height |
|---|---|---|---|---|---|---|
| Body | 400 | 14 | 50 | 0 | 17px | `1.6` |
| Emphasis | 600 | 24 | 50 | 0 | — | — |
| Italic accent | 400 italic | 14 | 100 | 1 | — | — |
| Pull quote | 400 italic | 36 | 100 | 1 | 22px | `1.4` |

```css
body {
  font-family: var(--font-serif);
  font-weight: 400;
  font-variation-settings: "opsz" 14, "SOFT" 50, "WONK" 0;
  font-size: 17px;
  line-height: 1.6;
}
em, .accent {
  font-style: italic;
  font-variation-settings: "opsz" 14, "SOFT" 100, "WONK" 1;
}
```

## Notes

- Keep reading text around 65 characters per line.
- The logo can use Bricolage Grotesque as its base, with custom tweaks to the letterforms.
- The specimen's accent color for the hand-drawn underline is `#5b8def` (light) and `#7fa6f5` (dark). This is a placeholder, not a final brand color.
