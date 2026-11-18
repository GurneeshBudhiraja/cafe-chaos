# Assets: store, Devpost and social images

One file for each place it is used. No copies: where two places take the
same size, the README says which file to use.

The store covers and the Devpost thumbnail are the game's own 3D models: the
café on a real-looking table, the game's cream hand pinching a guest above its
glowing seat. Two Blender scripts make them (run from `game/`):

1. `Blender --background --factory-startup --python scripts/render-key-art.py -- <renders> <shot>`
   for each shot: `jp-landscape`, `jp-hero` (the Japanese café, the lead) and
   `ca-square`, `ca-portrait` (the Canadian café). `--fast` for a quick test.
2. `Blender --background --factory-startup --python scripts/compose-covers.py -- <renders> assets`
   crops each render to its size and lays the logo over it.

The renders are kept in `source/renders/`. The logo, the icon and the social
images still come from `python3 scripts/build-store-art.py` (the sketch
picture now serves social only). The design notes are in `docs/STORE-ART.md`.

| File | Where it goes |
|---|---|
| `meta-store/hero-3000x900.png` | Meta store: Hero cover (title centred). The Japanese café, the pinch on the right. |
| `meta-store/cover-landscape-2560x1440.png` | Meta store: Landscape cover. The Japanese café, close on the pinch, title upper left. |
| `meta-store/cover-square-1440x1440.png` | Meta store: Square cover. The Canadian café, title across the top. Also a square social post. |
| `meta-store/cover-portrait-1008x1440.png` | Meta store: Portrait cover. The Canadian café, title across the top. |
| `meta-store/mini-landscape-1080x360.png` | Meta store: Mini landscape. Cut from the hero, title centred. |
| `meta-store/icon-512x512.png` | Meta store: Icon. The app's own icons (`public/icons`) are the same icon. |
| `meta-store/logo.png` | Meta store: Logo (transparent PNG). |
| `devpost/thumbnail-1500x1000.png` | Devpost: project thumbnail (3:2), cut from the landscape cover. Also the Devpost gallery image. |
| `social/link-preview-1200x630.png` | Link preview: Open Graph, X, Discord, Slack. The sketch picture. |
| `social/video-thumbnail-1280x720.png` | YouTube thumbnail for the demo video. The sketch picture. |
| `source/renders/*.jpg` | The 3D renders the covers are cut from. |
| `source/*.jpg` | The generated wordmark and sketch picture (logo, icon, social). |

Still needed for the Meta store: 5 screenshots, 2560×1440, real captures
from the game, no text.
