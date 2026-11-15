# Realm of Waystones

A browser-based 3D fantasy world with a built-in map editor. The default world, **Earth Remixed**, takes Earth's real coastlines (from Natural Earth) and warps them so the shapes are familiar but new. Mountain ranges sit roughly where the real ones are, the climates follow latitude and real deserts, jungles and steppes, and every continent, kingdom, city and sea has an original fantasy name. You can walk the whole world, or redraw it in the editor and play your own map.

It's built with [Three.js](https://threejs.org) (r160, included in `lib/`). There's no build step.

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Browsers block ES modules on `file://`, so use any static server.)

## Playing

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| `Shift` | Run (uses stamina) |
| `Space` | Jump |
| Mouse (click to lock) / `Q` `E` | Turn the camera; scroll to zoom |
| `M` | World map: click a woken (golden) waystone to travel there |
| `Tab` | Open the current map in the editor |
| `H` | Hide the help panel |

- The world is about 12,000 × 6,000 units. Terrain loads in pieces around you, with less detail far away.
- Eleven biomes, each with its own plants and atmosphere: grasslands, forest, taiga, tundra, ice fields, desert (with dunes), savanna, jungle, swamp, volcanic ashlands, and open sea. Snow, embers, fireflies and drifting dust appear in the matching biomes.
- Walled cities you can walk into, plus villages and ruins. Their building style follows the local biome (sandstone in the desert, dark timber in the north, thatch in the tropics).
- Roads link cities and villages over land.
- **Goal:** wake every waystone. Each one you wake becomes a fast-travel point.

## Map editor

Open it from the title screen or press `Tab` in game.

- **Sculpt:** Raise, Lower, Mountains, Smooth, Flatten, Land, Sea, River (`[` and `]` change brush size).
- **Paint:** any biome.
- **Place:** city, village, ruin, waystone, label (realm, region or sea), road (click points, then double-click), start point.
- **Edit:** select and drag, rename, delete, erase, undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`).
- **Roads:** "Build roads automatically" lays roads that avoid steep ground and water.
- **New maps:** Earth Remixed, a random continent, or an empty sea.
- **Files:** Save/Open keep maps in this browser's storage. Export/Import use `.realm` files (gzipped JSON).
- **Play ▶** starts at the start point; **Play from view** starts at the centre of the editor view.

## Code layout

| Path | What it does |
| --- | --- |
| `src/main.js` | Renderer, sky, water, clouds, input, camera, switching between title, game and editor |
| `src/map/mapdoc.js` | Map document (1024×512 height and biome grids, places, labels, roads), save/load |
| `src/map/generators.js` | Earth Remixed, random continent and empty sea generators; road pathfinding |
| `src/map/earthMask.js` | Run-length-encoded Earth land mask (generated, see below) |
| `src/map/biomes.js` | Biome colours, plants and atmosphere |
| `src/map/render2d.js` | Shaded parchment map used by the editor, minimap and world map |
| `src/map/names.js` | Fantasy name generator |
| `src/game/heightfield.js` | Detailed surface height and colour from the coarse map |
| `src/game/terrain.js` | Terrain chunks loaded around the player, plus a low-detail horizon mesh |
| `src/game/flora.js` | Plants and rocks for each biome, per chunk |
| `src/game/settlements.js` | Cities, villages, ruins and waystones |
| `src/game/player.js` | The traveller: movement, slopes, swimming, animation |
| `src/game/hud.js` | Compass, minimap, world map, banners |
| `src/game/game.js` | Ties a map's world together; atmosphere and region names |
| `src/editor/editor.js` | The map editor |

### Regenerating the Earth mask

```bash
npm i --no-save world-atlas@2.0.2 topojson-client@3.1.0
node tools/build-earth-mask.mjs > src/map/earthMask.js
```

Coastline data: [Natural Earth](https://www.naturalearthdata.com/) (public domain), packaged by world-atlas.
