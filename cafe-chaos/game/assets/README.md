# Assets: store, Devpost and social images

One file for each place it is used. No copies: where two places take the
same size, the README says which file to use. Rebuild all of them with
`python3 scripts/build-store-art.py` after replacing a picture in
`source/`. The design notes and prompts are in `docs/STORE-ART.md`.

| File | Where it goes |
|---|---|
| `meta-store/hero-3000x900.png` | Meta store: Hero cover (title centred). Interim: replace with The Pinch. |
| `meta-store/cover-landscape-2560x1440.png` | Meta store: Landscape cover. Also the Devpost gallery image. |
| `meta-store/cover-square-1440x1440.png` | Meta store: Square cover. Also a square social post. |
| `meta-store/cover-portrait-1008x1440.png` | Meta store: Portrait cover. Interim: replace with the tower. |
| `meta-store/mini-landscape-1080x360.png` | Meta store: Mini landscape. Interim: replace with the table. |
| `meta-store/icon-512x512.png` | Meta store: Icon. The app's own icons (`public/icons`) are the same icon. |
| `meta-store/logo.png` | Meta store: Logo (transparent PNG). |
| `devpost/thumbnail-1500x1000.png` | Devpost: project thumbnail (3:2). |
| `social/link-preview-1200x630.png` | Link preview: Open Graph, X, Discord, Slack. |
| `social/video-thumbnail-1280x720.png` | YouTube thumbnail for the demo video. |
| `source/*.jpg` | The generated pictures everything is built from. |

Still needed for the Meta store: 5 screenshots, 2560×1440, real captures
from the game, no text.
