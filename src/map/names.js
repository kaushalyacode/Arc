// Small fantasy name generator used by the editor when you place something new.
const PRE = ['Ash', 'Bel', 'Cal', 'Dor', 'El', 'Fen', 'Gal', 'Hal', 'Ir', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Per',
  'Quel', 'Ros', 'Sel', 'Tor', 'Ul', 'Val', 'Wyn', 'Yor', 'Zar', 'Bram', 'Crow', 'Dun', 'Ember', 'Frost', 'Glen',
  'Hollow', 'Iron', 'Kest', 'Lark', 'Mist', 'Oak', 'Raven', 'Silver', 'Thorn', 'Wolf'];
const MID = ['', '', '', 'a', 'e', 'i', 'o', 'an', 'en', 'ar', 'or', 'il'];
const CITY = ['haven', 'hold', 'gard', 'mere', 'crest', 'spire', 'ford', 'reach', 'fall', 'port', 'helm', 'wall', 'gate', 'keep'];
const VILLAGE = ['ton', 'by', 'stead', 'wick', 'ham', 'brook', 'field', 'dale', 'well', 'moor', 'cross'];
const RUIN = ['Ruins of', 'Fallen', 'Old', 'Broken', 'Lost', 'Sunken'];
const STONE = ['Stone', 'Waystone', 'Monolith', 'Standing Stone'];
const REGION = ['Reach', 'Wilds', 'Marches', 'Vale', 'Expanse', 'Heights', 'Shore', 'Wastes', 'Downs', 'Fells'];

const pick = (a, r) => a[Math.floor(r() * a.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function root(r) {
  return cap((pick(PRE, r) + pick(MID, r)).toLowerCase());
}

export function makeName(type, r = Math.random) {
  switch (type) {
    case 'city': return root(r) + pick(CITY, r);
    case 'village': return root(r) + pick(VILLAGE, r);
    case 'ruin': return `${pick(RUIN, r)} ${root(r)}${pick(['', 'dor', 'heim', 'ath', 'mar'], r)}`;
    case 'waystone': return `${root(r)} ${pick(STONE, r)}`;
    default: return `The ${root(r)} ${pick(REGION, r)}`;
  }
}
