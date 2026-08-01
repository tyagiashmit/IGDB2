// IGDB platform ID for "PC (Microsoft Windows)"
export const PC_PLATFORM_ID = 6;

export const isPC = (platform) => platform.id === PC_PLATFORM_ID;

// URL patterns to detect storefronts from IGDB website entries.
// pcOnly: true  → storefront only shown when the game has a PC platform (id=6)
// pcOnly: false → storefront shown for any game with the matching URL
const STORE_URL_PATTERNS = [
  { re: /store\.steampowered\.com/,                                          name: 'Steam',           pcOnly: true },
  { re: /epicgames\.com\/store/,                                             name: 'Epic Games',      pcOnly: true },
  { re: /gog\.com\/(?:game|games|en\/game)/,                                 name: 'GOG',             pcOnly: true },
  { re: /itch\.io/,                                                          name: 'itch.io',         pcOnly: true },
  // Xbox Store = xbox.com console/ecosystem store — NOT PC-only (covers console purchases)
  { re: /xbox\.com\/(?:[a-z-]+\/)?games\/store/,                             name: 'Xbox Store',      pcOnly: false },
  // Microsoft Store = Windows PC store (apps.microsoft.com / microsoft.com/store)
  { re: /(?:apps\.microsoft\.com|microsoft\.com\/(?:en-[a-z]+\/)?store)/,   name: 'Microsoft Store', pcOnly: true },
];

const STORE_ORDER = ['Steam', 'Epic Games', 'GOG', 'itch.io', 'Xbox Store', 'Microsoft Store'];

export const STORE_META = {
  'Steam':           { key: 'steam',    label: 'Steam' },
  'Epic Games':      { key: 'epic',     label: 'Epic Games' },
  'GOG':             { key: 'gog',      label: 'GOG' },
  'itch.io':         { key: 'itchio',   label: 'itch.io' },
  'Xbox Store':      { key: 'xbox',     label: 'Xbox Store' },
  'Microsoft Store': { key: 'msstore',  label: 'Microsoft Store' },
};

export function getStorefronts(websites = [], hasPCPlatform = false) {
  const found = new Set();
  for (const site of websites) {
    const url = site.url ?? '';
    for (const { re, name, pcOnly } of STORE_URL_PATTERNS) {
      if (re.test(url)) {
        if (!pcOnly || hasPCPlatform) found.add(name);
        break;
      }
    }
  }
  return STORE_ORDER.filter((s) => found.has(s));
}
