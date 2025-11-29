import baseSizeSource from './base-sizes-source';

type RawBaseMap = typeof baseSizeSource;

interface BaseSizeEntry {
  mm: number;
  normalized: string;
  tokens: string[];
}

const INCHES_PER_MM = 1 / 25.4;
const rawEntries: BaseSizeEntry[] = [];
const tokenCache = new Map<string, Set<string>>();

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokensFor(value: string): string[] {
  return normalizeText(value).split(' ').filter(Boolean);
}

function parseBaseLabel(label: string): number | undefined {
  const match = label.toLowerCase().match(/(\d+)\s*(?:x\s*(\d+))?/);
  if (!match) return undefined;
  const first = parseFloat(match[1]);
  if (!match[2]) return first;
  const second = parseFloat(match[2]);
  return Math.max(first, second);
}

function entryTokenSet(entry: BaseSizeEntry): Set<string> {
  if (!tokenCache.has(entry.normalized)) {
    tokenCache.set(entry.normalized, new Set(entry.tokens));
  }
  return tokenCache.get(entry.normalized)!;
}

Object.entries(baseSizeSource as RawBaseMap).forEach(([label, items]) => {
  const mm = parseBaseLabel(label);
  if (!mm) return;
  items.forEach(item => {
    const normalized = normalizeText(item);
    if (!normalized) return;
    rawEntries.push({
      mm,
      normalized,
      tokens: tokensFor(item)
    });
  });
});

const manualOverrides: Record<string, number> = {
  'objective marker': 40
};

function scoreMatch(entry: BaseSizeEntry, targetTokens: string[]): number {
  const entryTokens = entryTokenSet(entry);
  if (targetTokens.length === 0) return 0;
  const matches = targetTokens.filter(token => entryTokens.has(token));
  if (matches.length === targetTokens.length) {
    return matches.length * 3;
  }
  if (matches.length > 0) {
    return matches.length;
  }
  const normalizedTarget = targetTokens.join(' ');
  return entry.normalized.includes(normalizedTarget) ? targetTokens.length : 0;
}

export function lookupBaseSizeMM(unitName: string): number | undefined {
  const normalizedName = normalizeText(unitName);
  if (!normalizedName) return undefined;
  if (manualOverrides[normalizedName]) {
    return manualOverrides[normalizedName];
  }
  const tokens = normalizedName.split(' ').filter(Boolean);
  let bestScore = 0;
  let best: BaseSizeEntry | undefined;
  for (const entry of rawEntries) {
    const score = scoreMatch(entry, tokens);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best && bestScore > 0) {
    return best.mm;
  }
  return undefined;
}

export function lookupBaseSizeInches(unitName: string): number | undefined {
  const mm = lookupBaseSizeMM(unitName);
  return mm ? mm * INCHES_PER_MM : undefined;
}
