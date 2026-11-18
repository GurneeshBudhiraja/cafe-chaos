# Assets: store, Devpost and social images

One file for each place it is used, each at that place's exact size. Every
image is the 3D logo centred on the brand's moss field, flat
(no game screenshots). Built by Blender scripts (run from `game/`):

1. The logo: `Blender --background --factory-startup --python scripts/build-logo-3d.py -- assets/source/logo`
   (then rename `logo-3d-plain.png` to `logo-3d.png`).
2. Everything else: `Blender --background --factory-startup --python scripts/build-brand-assets.py -- assets`
   (also writes the app icons in `public/icons`).

| File | Where it goes |
|---|---|
| `meta-store/logo.png` | Meta store: Logo (transparent PNG). The one logo for every use. |
| `meta-store/logo-on-white.png` | The logo on white, for light backgrounds (print, documents, press). |
| `meta-store/icon-512x512.png` | Meta store: Icon. The logo on flat moss; the app's icons (`public/icons`) are the same. |
| `meta-store/hero-3000x900.png` | Meta store: Hero cover. |
| `meta-store/cover-landscape-2560x1440.png` | Meta store: Landscape cover. |
| `meta-store/cover-square-1440x1440.png` | Meta store: Square cover. Also a square social post. |
| `meta-store/cover-portrait-1008x1440.png` | Meta store: Portrait cover. |
| `meta-store/mini-landscape-1080x360.png` | Meta store: Mini landscape. |
| `devpost/thumbnail-1500x1000.png` | Devpost: project thumbnail (3:2) and gallery image. |
| `social/link-preview-1200x630.png` | Link preview: Open Graph, X, Discord, Slack. |
| `social/video-thumbnail-1280x720.png` | YouTube thumbnail for the demo video. |
| `source/logo/` | The 3D logo (transparent, and on moss). |
| `source/renders/` | 3D renders of the game (kept for screenshots and press; not used by the brand images). |
| `source/fonts/` | Fredoka (SIL Open Font License), the logo's letters. |

Still needed for the Meta store: 5 screenshots, 2560×1440, real captures
from the game, no text.
