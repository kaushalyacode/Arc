# Realm of Waystones

A browser-based 3D fantasy world you explore in the third person. You walk from the green hills of Thistledown, over the Frostspine Pass, through Elderwood, across the Silverrun, past the white city of Highwatch, and into the smoking Ashlands under Mount Cinder. On the way you wake five glowing waystones.

It's built with [Three.js](https://threejs.org) (a copy of r160 is in `lib/`). There's no build step and nothing to install.

## Run it

Browsers block ES modules on `file://`, so serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| `Shift` | Run (uses stamina) |
| `Space` | Jump |
| Mouse (click to lock) / `Q` `E` | Turn the camera |
| Scroll wheel | Zoom |
| `M` | Full map |
| `H` | Hide the help panel |

## Code layout

- `index.html`: page, HUD, title and victory screens, styles
- `src/main.js`: renderer, sky, lighting, input, camera, game loop, atmosphere changes
- `src/world.js`: procedural heightmap, region layout, trees, burrows, city, spire, volcano, bridges, waystones, minimap image
- `src/player.js`: the traveller model, movement, slope limits, swimming and jumping, walk animation
- `src/ui.js`: compass, minimap, region banners, objective tracker
- `src/noise.js`: seeded Perlin noise and RNG

The world is an original fantasy setting.
