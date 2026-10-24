# Fonts

Static instances of two Google Fonts variable fonts, subset to Latin, for the
UIKitML panels (loaded with `@font-face`; UIKit builds the glyph atlas at
runtime). Both are licensed under the SIL Open Font License 1.1 (`OFL.txt`).

| File | Family | Axes | Used for |
| --- | --- | --- | --- |
| `bricolage-hero.ttf` | Bricolage Grotesque | wght 800, wdth 78, opsz 96 | Clock |
| `bricolage-title.ttf` | Bricolage Grotesque | wght 700, wdth 85, opsz 32 | Card titles, buttons |
| `bricolage-label.ttf` | Bricolage Grotesque | wght 600, wdth 100, opsz 12 | Small uppercase labels |
| `fraunces-body.ttf` | Fraunces | wght 400, opsz 14 | Body text, card previews |

To regenerate: request the exact axis values from the Google Fonts CSS API
(for example `css2?family=Bricolage+Grotesque:opsz,wdth,wght@96,78,800`),
download the TTF it lists, then subset:

```sh
pyftsubset in.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026" \
  --layout-features='kern,liga' --output-file=out.ttf
```
