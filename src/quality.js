// Device detection and graphics settings. Phones and tablets get a lighter
// profile; add ?quality=low or ?quality=high to the URL to force one.

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const noHover = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
export const IS_TOUCH = coarse || (navigator.maxTouchPoints > 0 && noHover);

const PROFILES = {
  low: {
    name: 'low', pixelRatio: 1.5, antialias: false, shadowSize: 1024, shadowRange: 80,
    viewRadius: 1500, lod: [260, 620, 1100], floraRadius: 430, floraDensity: 0.65,
    particles: 300, clouds: 24, farFog: 0.6,
  },
  high: {
    name: 'high', pixelRatio: 2, antialias: true, shadowSize: 2048, shadowRange: 140,
    viewRadius: 2400, lod: [430, 950, 1700], floraRadius: 760, floraDensity: 1,
    particles: 700, clouds: 60, farFog: 1,
  },
};

let pick = IS_TOUCH ? 'low' : 'high';
try {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && PROFILES[q]) pick = q;
} catch (_) { /* no URL access */ }

export const QUALITY = PROFILES[pick];
