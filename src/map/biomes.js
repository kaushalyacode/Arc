// Biome definitions shared by the editor, the 2D map renderer and the 3D world.
// Colours are sRGB 0..1. `flora` gives the chance that an 8x8 patch of ground
// holds that kind of plant or rock.

export const BIOMES = [
  {
    id: 0, key: 'ocean', name: 'Open Sea', paint: false,
    ground: [0.36, 0.34, 0.26], ground2: [0.32, 0.3, 0.24], map: [0.28, 0.45, 0.6],
    fog: 0xb7cfe0, flora: {}, rough: 0.6,
  },
  {
    id: 1, key: 'grass', name: 'Grasslands',
    ground: [0.45, 0.64, 0.27], ground2: [0.37, 0.56, 0.22], map: [0.6, 0.72, 0.4],
    fog: 0xb7cfe0, flora: { broad: 0.015, bush: 0.04, tuft: 0.2, rock: 0.006 }, rough: 1,
  },
  {
    id: 2, key: 'forest', name: 'Forest',
    ground: [0.27, 0.46, 0.18], ground2: [0.22, 0.39, 0.15], map: [0.33, 0.55, 0.28],
    fog: 0xaecbc0, flora: { broad: 0.32, pine: 0.05, bush: 0.07, tuft: 0.05 }, rough: 1.2,
  },
  {
    id: 3, key: 'taiga', name: 'Taiga',
    ground: [0.33, 0.42, 0.29], ground2: [0.4, 0.44, 0.35], map: [0.38, 0.5, 0.4],
    fog: 0xb4c6d2, flora: { pine: 0.3, rock: 0.015, bush: 0.03 }, rough: 1.1,
  },
  {
    id: 4, key: 'tundra', name: 'Tundra',
    ground: [0.56, 0.57, 0.46], ground2: [0.48, 0.51, 0.43], map: [0.66, 0.67, 0.58],
    fog: 0xc8d2da, flora: { pine: 0.008, rock: 0.04, bush: 0.03, tuft: 0.05 }, rough: 0.9,
  },
  {
    id: 5, key: 'snow', name: 'Ice Fields',
    ground: [0.93, 0.95, 0.98], ground2: [0.84, 0.89, 0.95], map: [0.93, 0.95, 0.98],
    fog: 0xdde7f0, flora: { rock: 0.008 }, rough: 0.8,
  },
  {
    id: 6, key: 'desert', name: 'Desert',
    ground: [0.88, 0.74, 0.48], ground2: [0.82, 0.63, 0.4], map: [0.9, 0.8, 0.56],
    fog: 0xe8d5b0, flora: { cactus: 0.006, rock: 0.012, dead: 0.002 }, rough: 0.7, dunes: true,
  },
  {
    id: 7, key: 'savanna', name: 'Savanna',
    ground: [0.74, 0.66, 0.37], ground2: [0.64, 0.59, 0.31], map: [0.8, 0.74, 0.46],
    fog: 0xdcd1ae, flora: { acacia: 0.035, bush: 0.03, tuft: 0.22, rock: 0.005 }, rough: 0.9,
  },
  {
    id: 8, key: 'jungle', name: 'Jungle',
    ground: [0.2, 0.43, 0.15], ground2: [0.15, 0.36, 0.12], map: [0.2, 0.48, 0.24],
    fog: 0xa4c4ac, flora: { palm: 0.14, broad: 0.32, bush: 0.18 }, rough: 1.3,
  },
  {
    id: 9, key: 'swamp', name: 'Swamp',
    ground: [0.31, 0.37, 0.21], ground2: [0.25, 0.31, 0.19], map: [0.4, 0.48, 0.36],
    fog: 0x8e9c80, flora: { dead: 0.05, reed: 0.3, broad: 0.04 }, rough: 0.5, wet: true,
  },
  {
    id: 10, key: 'ash', name: 'Ashlands',
    ground: [0.19, 0.15, 0.14], ground2: [0.27, 0.19, 0.15], map: [0.36, 0.3, 0.28],
    fog: 0x5b3a2c, flora: { dead: 0.02, rock: 0.05 }, rough: 1.1, ember: true,
  },
];

export const BIOME_BY_KEY = Object.fromEntries(BIOMES.map((b) => [b.key, b]));

// Altitude above which snow lies, by latitude-like row position (0 = north edge, 1 = south edge).
// The equator sits a little below the middle of the map.
export function snowline(v) {
  const lat = Math.abs(v - 0.575) / 0.425; // 0 at equator, ~1 at the edges
  return 265 - Math.min(1, lat) * 205;
}
