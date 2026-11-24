import { useState, useMemo, useEffect } from 'react';
import { 
  Cpu, Database, TrendingUp, Swords, 
  CheckCircle2, AlertTriangle, ArrowRightLeft, BarChart3, Sparkles, Crosshair, FileText,
  Crown, Shield, Compass, Download, HelpCircle, Eye, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend 
} from 'recharts';
import { Seo } from '../components/Seo';
import { ASPECT_CONFIG, SET_CONFIG, PREMIER_BAN_LIST, ETERNAL_BAN_LIST } from '../lib/consts';
import {
  Card,
  CardType,
  Deck,
  DeckCard,
  LeaderCard,
  normalizeCardId,
  parseMetaDeck,
  parseSWUDBDeck,
} from '../components/Decks';

import cardCache from '../../data/card-cache.json';
import metaDecksCache from '../../data/meta-decks-v2.json';
// import metaDecksCache from '../../data/meta-decks.json';

interface DeckMetaInfo {
  name: string;
  author: string;
  winRate?: string;
}

function getAspectConfig(name: string) {
  const clean = name.trim();
  const matchedKey = Object.keys(ASPECT_CONFIG).find(
    k => k.toLowerCase() === clean.toLowerCase()
  );
  return matchedKey
    ? ASPECT_CONFIG[matchedKey]
    : {
        label: clean,
        badge: "bg-slate-900 text-slate-300 border-slate-700 shadow-slate-950/40",
        dot: "bg-cyan-400",
      };
}

function getSetConfig(name: string) {
  const clean = name.trim();
  const matchedKey = Object.keys(SET_CONFIG).find(
    k => k.toLowerCase() === clean.toLowerCase()
  );
  return matchedKey
    ? SET_CONFIG[matchedKey]
    : {
        label: clean,
        badge: "bg-slate-900 text-slate-300 border-slate-700 shadow-slate-950/40",
        dot: "bg-cyan-400",
      };
}

/** Resolve an image URL for a card, preferring official CDN URLs or card data */
function getCardImageUrl(cardData: any, fallbackCard?: any): string | null {
  if (fallbackCard?.imageUrl) return fallbackCard.imageUrl;
  if (cardData?.imageUrl) return cardData.imageUrl;
  if (cardData?.set && cardData?.number) {
    return `https://api.swu-db.com/cards/${cardData.set.toLowerCase()}/${cardData.number}?format=image`;
  }
  return null;
}

function formatCardTypeLabel(type: CardType | string): string {
  if (typeof type === 'number') {
    switch (type) {
      case CardType.LEADER:
        return 'Leader';
      case CardType.BASE:
        return 'Base';
      case CardType.UNIT:
        return 'Unit';
      case CardType.UPGRADE:
        return 'Upgrade';
      case CardType.EVENT:
        return 'Event';
      default:
        return 'Unit';
    }
  }
  return String(type || 'Unit');
}

function parseCardTypeFromString(rawType?: string): CardType {
  switch (String(rawType ?? '').toUpperCase()) {
    case 'LEADER':
      return CardType.LEADER;
    case 'BASE':
      return CardType.BASE;
    case 'UNIT':
      return CardType.UNIT;
    case 'UPGRADE':
      return CardType.UPGRADE;
    case 'EVENT':
      return CardType.EVENT;
    default:
      return CardType.UNIT;
  }
}

function formatDeckMainLines(main: DeckCard[] = []): string {
  return main
    .map((item) => {
      const displayName = item.name || item.id || 'Unknown Card';
      const idPart = item.id ? ` (${item.id})` : '';
      return `${item.count}x ${displayName}${idPart}`;
    })
    .join('\n');
}

function createEmptyDeck(): Deck {
  const emptyLeader: LeaderCard = {
    id: '',
    name: 'Commander',
    count: 1,
    cost: 0,
    type: CardType.LEADER,
    arena: 'None',
    traits: [],
    set: '',
    number: '',
    imageUrl: null,
    aspects: [],
    unique: false,
  };

  const emptyBase: Card = {
    id: '',
    name: 'Unassigned Base',
    count: 1,
    cost: 0,
    type: CardType.BASE,
    arena: 'None',
    traits: [],
    set: '',
    number: '',
    imageUrl: null,
    aspects: [],
    unique: false,
  };

  return {
    leader: emptyLeader,
    base: emptyBase,
    main: [],
    side: [],
  };
}

/** Classify a deck by archetype based on its cost and unit distribution */
function classifyArchetype(costDist: Record<string, number>, totalUnits: number, costSum: number, spaceUnits: number) {
  const avgUnitCost = totalUnits > 0 ? costSum / totalUnits : 0;
  const spaceRatio = totalUnits > 0 ? Math.round((spaceUnits / totalUnits) * 100) : 0;
  const earlyGame = (costDist['1'] || 0) + (costDist['2'] || 0);
  const lateGame = (costDist['5'] || 0) + (costDist['6+'] || 0);

  if (earlyGame >= 18 && avgUnitCost <= 2.6) return "Aggro Rush";
  if (lateGame >= 12 && avgUnitCost >= 3.6) return "Hard Control Ramp";
  if (spaceRatio >= 55) return "Space Swarm Tempo";
  return "Midrange Tempo";
}

/** Compute target curves by averaging meta deck distributions, grouped by archetype */
function computeMetaTargetCurves(metaDecks: Record<string, any>, resolvedCards: Record<string, any>) {
  const archetypeBuckets: Record<string, { curves: Record<string, number>[]; count: number }> = {};

  for (const key of Object.keys(metaDecks)) {
    const rawMetaDeck = metaDecks[key];
    if (!rawMetaDeck) continue;

    const parsedDeck = parseMetaDeck(rawMetaDeck, resolvedCards);
    if (!parsedDeck.main || parsedDeck.main.length === 0) continue;

    const c: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
    let unitCount = 0, costSum = 0, spaceUnits = 0;

    for (const item of parsedDeck.main) {
      const qty = item.count || item.quantity || 1;
      const cost = typeof item.cost === 'number' ? item.cost : parseInt(String(item.cost || '2'), 10);
      const costKey = cost >= 6 ? '6+' : String(cost);
      c[costKey] = (c[costKey] || 0) + qty;

      if (item.type === CardType.UNIT) {
        unitCount += qty;
        costSum += cost * qty;
        if (item.arena.toLowerCase() === 'space') spaceUnits += qty;
      }
    }

    const archetype = classifyArchetype(c, unitCount, costSum, spaceUnits);
    if (!archetypeBuckets[archetype]) {
      archetypeBuckets[archetype] = { curves: [], count: 0 };
    }
    archetypeBuckets[archetype].curves.push(c);
    archetypeBuckets[archetype].count += 1;
  }

  // Average each archetype's curves
  const result: Record<string, { curve: Record<string, number>; sampleSize: number }> = {};
  for (const [archetype, bucket] of Object.entries(archetypeBuckets)) {
    const avg: Record<string, number> = {};
    const keys = ['1', '2', '3', '4', '5', '6+'];
    for (const k of keys) {
      const total = bucket.curves.reduce((sum, curve) => sum + (curve[k] || 0), 0);
      avg[k] = Math.round(total / bucket.count);
    }
    result[archetype] = { curve: avg, sampleSize: bucket.count };
  }

  return result;
}

// Hardcoded competitive baseline curves
const FALLBACK_CURVES: Record<string, Record<string, number>> = {
  "Aggro Rush": { '1': 9, '2': 18, '3': 12, '4': 6, '5': 3, '6+': 2 },
  "Hard Control Ramp": { '1': 3, '2': 8, '3': 10, '4': 9, '5': 8, '6+': 12 },
  "Space Swarm Tempo": { '1': 6, '2': 15, '3': 14, '4': 8, '5': 4, '6+': 3 },
  "Midrange Tempo": { '1': 4, '2': 12, '3': 12, '4': 8, '5': 6, '6+': 8 },
};

const STAR_WARS_LOADING_PHRASES = [
  "Consulting tactical battle droid databanks...",
  "Calibrating deflector shields for opening mulligan...",
  "Scanning Death Star thermal exhaust ports for curve weaknesses...",
  "Triangulating ground vs. space lane pressure...",
  "Translating Bothan reconnaissance telemetry...",
  "Negotiating with Porgs in the Millennium Falcon engine room...",
  "Rerouting auxiliary power to edge inference array...",
  "Simulating 14,000,605 tactical combat outcomes...",
  "Locking S-foils into attack position...",
  "Aligning Kyber crystals with leadership deployment turn...",
  "Calculating hyperdrive jump coordinates for initiative seize..."
];

export default function DeckGrader() {
  const [fetchStats] = useState({ 
    cached: Object.keys(cardCache || {}).length, 
    api: 0 
  });
  
  const metaDecks: Record<string, any> = metaDecksCache || {};
  const presetKeys = Object.keys(metaDecks);
  const defaultKey = presetKeys[0] || '';

  const resolvedCards: Record<string, any> = cardCache || {};

  const findCardData = (identifier: string) => {
    if (!identifier) return null;
    const cleanId = String(identifier).trim().toUpperCase();
    if (resolvedCards[cleanId]) return resolvedCards[cleanId];

    // Check if ID is in SET_NUM format: normalize padded and unpadded (e.g. HMW_14 <-> HMW_014)
    const m = cleanId.match(/^([A-Z0-9]+)_0*(\d+)$/);
    if (m) {
      const paddedKey = `${m[1]}_${m[2].padStart(3, '0')}`;
      if (resolvedCards[paddedKey]) return resolvedCards[paddedKey];
      const unpaddedKey = `${m[1]}_${m[2]}`;
      if (resolvedCards[unpaddedKey]) return resolvedCards[unpaddedKey];
    }

    const found = Object.values(resolvedCards).find((v: any) => 
      v.name?.toUpperCase() === cleanId || 
      (v.set && `${v.set}_${v.number}`.toUpperCase() === cleanId) ||
      (v.set && `${v.set}_${parseInt(String(v.number), 10)}`.toUpperCase() === cleanId)
    );
    return found || null;
  };

  const [selectedPreset, setSelectedPreset] = useState<string>(defaultKey);
  const [selectedMetaDeck, setSelectedMetaDeck] = useState<any>(() =>
    defaultKey ? metaDecks[defaultKey] ?? null : null
  );
  const [manualMainOverride, setManualMainOverride] = useState<DeckCard[] | null>(null);

  // Resolve the full Deck directly from selectedMetaDeck + cardCache JSON
  const resolvedDeck = useMemo<Deck>(() => {
    if (!selectedMetaDeck) {
      return createEmptyDeck();
    }
    return selectedMetaDeck._source === 'swudb'
      ? parseSWUDBDeck(selectedMetaDeck, resolvedCards)
      : parseMetaDeck(selectedMetaDeck, resolvedCards);
  }, [selectedMetaDeck, resolvedCards]);

  // Combine resolved leader/base/side with any manual textarea edits to main
  const currentDeck = useMemo<Deck>(
    () => ({
      ...resolvedDeck,
      main: manualMainOverride ?? resolvedDeck.main,
    }),
    [resolvedDeck, manualMainOverride]
  );

  const deckMeta = useMemo<DeckMetaInfo>(
    () => ({
      name: selectedMetaDeck?.metadata?.name || selectedMetaDeck?.name || 'Custom Deck',
      author: selectedMetaDeck?.metadata?.author || selectedMetaDeck?.author || 'User',
      winRate: selectedMetaDeck?.metadata?.winRate,
    }),
    [selectedMetaDeck]
  );

  const [rawDeckInput, setRawDeckInput] = useState<string>(() =>
    formatDeckMainLines(currentDeck.main)
  );
  const [skipNextMainSync, setSkipNextMainSync] = useState(false);

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [showTargetExplainer, setShowTargetExplainer] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiSource, setAiSource] = useState<'gemini' | 'heuristic' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);

  // Sync rawDeckInput lines whenever currentDeck.main changes
  useEffect(() => {
    if (skipNextMainSync) {
      setSkipNextMainSync(false);
      return;
    }
    setRawDeckInput(formatDeckMainLines(currentDeck.main));
  }, [currentDeck.main, skipNextMainSync]);

  useEffect(() => {
    if (!isAnalyzing) {
      setLoadingPhraseIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingPhraseIdx(prev => (prev + 1) % STAR_WARS_LOADING_PHRASES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  // SWUDB Import state
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // Card image hover/lightbox preview state
  const [previewCard, setPreviewCard] = useState<{ name: string; url: string } | null>(null);

  const handleSelectPreset = (key: string) => {
    const preset = metaDecks[key];
    if (!preset) return;

    setSelectedPreset(key);
    setSelectedMetaDeck(preset);
    setManualMainOverride(null);
    setImportError('');
  };

  /** Import a deck from SWUDB by URL or alphanumeric deck ID */
  const handleSwudbImport = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportError('');

    try {
      // Extract deck ID: handle full URL, /deck/view/ID, /deck/ID, or plain ID
      const input = importUrl.trim();
      const match = input.match(/\/deck(?:\/view)?\/([a-zA-Z0-9_\-]+)/);
      const deckId = match ? match[1] : input.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
      
      if (!/^[a-zA-Z0-9_\-]+$/.test(deckId)) {
        throw new Error('Please enter a valid SWUDB deck URL or alphanumeric ID (e.g. ABCD1234).');
      }

      const res = await fetch(`/api/swudb/${deckId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch from SWUDB (status ${res.status})`);
      }

      const data = await res.json();
      const previewParsed = parseSWUDBDeck(data, resolvedCards);

      if (previewParsed.main.length === 0) {
        throw new Error('No cards found in the imported deck payload.');
      }

      setSelectedPreset('');
      setSelectedMetaDeck({ ...data, _source: 'swudb' });
      setManualMainOverride(null);
      setImportUrl('');
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  /** Update manual main deck override when user edits the decklist textarea directly */
  const handleDeckInputChange = (nextText: string) => {
    setRawDeckInput(nextText);
    setSkipNextMainSync(true);

    const nextMain: DeckCard[] = [];
    const lineRegex = /^(\d+)x?\s+(.+?)(?:\s+\(([^)]+)\))?$/i;

    for (const rawLine of nextText.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = line.match(lineRegex);
      if (!match) continue;

      const qty = parseInt(match[1], 10) || 1;
      const namePart = match[2].trim();
      const idPart = match[3]?.trim();
      const lookupKey = idPart || namePart;
      const cached = findCardData(lookupKey);
      const existing = currentDeck.main.find(
        (c) =>
          (idPart && normalizeCardId(c.id) === normalizeCardId(idPart)) ||
          c.name.toLowerCase() === namePart.toLowerCase()
      );

      const normalizedId = normalizeCardId(
        idPart || existing?.id || (cached?.set && cached?.number ? `${cached.set}_${cached.number}` : '')
      );

      const parsedType = cached?.type
        ? parseCardTypeFromString(cached.type)
        : (existing?.type ?? CardType.UNIT);

      const parsedCost = cached?.cost !== undefined
        ? Number(cached.cost)
        : (existing?.cost ?? 2);

      const parsedArena = String(
        cached?.arenas?.[0] ?? cached?.arena ?? existing?.arena ?? 'Ground'
      );

      const parsedTraits = Array.isArray(cached?.traits)
        ? cached.traits.map(String)
        : (existing?.traits ?? []);

      const parsedAspects = Array.isArray(cached?.aspects)
        ? cached.aspects.map(String)
        : (existing?.aspects ?? []);

      nextMain.push({
        id: normalizedId,
        name: cached?.name || existing?.name || namePart,
        subtitle: cached?.subtitle ?? existing?.subtitle,
        count: qty,
        quantity: qty,
        cost: Number.isNaN(parsedCost) ? 2 : parsedCost,
        type: parsedType,
        arena: parsedArena,
        traits: parsedTraits,
        hp: cached?.hp !== undefined ? Number(cached.hp) : existing?.hp,
        power: cached?.power !== undefined ? Number(cached.power) : existing?.power,
        set: String(cached?.set ?? existing?.set ?? ''),
        number: String(cached?.number ?? existing?.number ?? ''),
        imageUrl: getCardImageUrl(cached, existing),
        aspects: parsedAspects,
        text: cached?.text ?? existing?.text,
        unique: Boolean(cached?.unique ?? existing?.unique ?? false),
      });
    }

    setManualMainOverride(nextMain);
  };

  // Leader resolution from resolvedDeck / currentDeck
  const leaderCard = currentDeck.leader;
  const leaderRawId = leaderCard.id || '';
  const leaderCardFromCache = findCardData(leaderRawId);
  const [leaderRawTitle, leaderRawSub] = leaderCard.name.includes('|')
    ? leaderCard.name.split('|').map((s: string) => s.trim())
    : [leaderCard.name, ''];

  const leaderName = leaderCard.name || leaderCardFromCache?.name || leaderRawTitle || leaderRawId || 'Commander';
  const leaderSubtitle = leaderCard.subtitle || leaderCardFromCache?.subtitle || leaderRawSub || '';

  // Base resolution from resolvedDeck / currentDeck
  const baseCard = currentDeck.base;
  const baseRawId = baseCard.id || '';
  const baseCardFromCache = findCardData(baseRawId);
  const baseName = baseCard.name || baseCardFromCache?.name || baseRawId || 'Unassigned Base';
  const baseSubtitle = baseCard.subtitle || baseCardFromCache?.subtitle || '';
  const baseHp = baseCard.hp ?? baseCardFromCache?.hp ?? '30';

  // Aspects from Leader & Base in resolvedDeck
  const allAspects = useMemo(() => {
    const fromLeader = leaderCard.aspects?.length ? leaderCard.aspects : (leaderCardFromCache?.aspects ?? []);
    const fromBase = baseCard.aspects?.length ? baseCard.aspects : (baseCardFromCache?.aspects ?? []);
    const combined = [...fromLeader, ...fromBase]
      .map((s) => String(s).trim())
      .filter(Boolean);
    return Array.from(new Set(combined));
  }, [leaderCard.aspects, baseCard.aspects, leaderCardFromCache, baseCardFromCache]);

  // Compute target curves dynamically from cached tournament meta decks
  const metaTargetData = useMemo(() => {
    return computeMetaTargetCurves(metaDecks, resolvedCards);
  }, [metaDecks, resolvedCards]);

  const analysis = useMemo(() => {
    const c: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
    let countTotal = 0;
    let costSum = 0;
    let unitCount = 0;
    let groundUnits = 0;
    let spaceUnits = 0;
    let events = 0;
    let upgrades = 0;
    const sets: Set<string> = new Set();
    let outOfAspect = 0;
    const traitCounts: Record<string, number> = {};
    const parsedCards: DeckCard[] = [];
    let validForPremier = true;
    let validForEternal = true;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}_${month}_${day}`;

    const allAspectsSet = new Set(allAspects);

    for (const item of currentDeck.main) {
      const qty = item.count || item.quantity || 1;
      const cardId = normalizeCardId(item.id);
      const cached = findCardData(cardId || item.name);

      if (qty > 3) {
        validForEternal = false;
        validForPremier = false;
      }

      const rawCost = item.cost ?? cached?.cost ?? 2;
      const cost = typeof rawCost === 'number' ? rawCost : parseInt(String(rawCost || '2'), 10);
      const safeCost = Number.isNaN(cost) ? 2 : cost;
      const costKey = safeCost >= 6 ? '6+' : String(safeCost);
      c[costKey] = (c[costKey] || 0) + qty;
      countTotal += qty;

      const cardType = item.type ?? parseCardTypeFromString(cached?.type);
      if (cardType === CardType.UNIT) {
        unitCount += qty;
        costSum += safeCost * qty;
        const arena = (item.arena || cached?.arena || cached?.arenas?.[0] || '').toLowerCase();
        if (arena === 'space') spaceUnits += qty;
        else groundUnits += qty;
      } else if (cardType === CardType.EVENT) {
        events += qty;
      } else if (cardType === CardType.UPGRADE) {
        upgrades += qty;
      }

      const traits = item.traits.length > 0 ? item.traits : (Array.isArray(cached?.traits) ? cached.traits : []);
      traits.forEach((t: string) => {
        traitCounts[t] = (traitCounts[t] || 0) + qty;
      });

      const cardSet = item.set || cached?.set || '';
      if (cardSet) {
        sets.add(cardSet);
      }

      const aspects = item.aspects.length > 0 ? item.aspects : (Array.isArray(cached?.aspects) ? cached.aspects : []);
      if (aspects.some((t: string) => !allAspectsSet.has(t))) {
        outOfAspect += qty;
      }

      if (!validForEternal) {
        const bannedCard = ETERNAL_BAN_LIST[cardId] || ETERNAL_BAN_LIST[item.name];
        if (bannedCard && bannedCard.ban_date < todayStr) {
          if (!bannedCard.unban_date || bannedCard.unban_date > todayStr) {
            validForEternal = false;
          }
        }
      }
      if (!validForPremier) {
        const bannedCard = PREMIER_BAN_LIST[cardId] || PREMIER_BAN_LIST[item.name];
        if (bannedCard && bannedCard.ban_date < todayStr) {
          if (!bannedCard.unban_date || bannedCard.unban_date > todayStr) {
            validForPremier = false;
          }
        }
      }

      parsedCards.push({
        ...item,
        id: cardId,
        name: item.name || cached?.name || cardId || 'Unknown Card',
        count: qty,
        quantity: qty,
        cost: safeCost,
        type: cardType,
        arena: item.arena || cached?.arena || cached?.arenas?.[0] || 'Ground',
        traits,
        set: cardSet,
        number: item.number || cached?.number || '',
        imageUrl: getCardImageUrl(cached, item),
        aspects,
        unique: Boolean(item.unique ?? cached?.unique ?? false),
      });
    }

    const avgUnitCost = unitCount > 0 ? (costSum / unitCount) : 0;
    const spaceRatio = unitCount > 0 ? Math.round((spaceUnits / unitCount) * 100) : 0;
    const groundRatio = unitCount > 0 ? Math.round((groundUnits / unitCount) * 100) : 0;

    const inferredArchetype = classifyArchetype(c, unitCount, costSum, spaceUnits);

    // Dynamic curve selection: averaged from meta or fallback baseline
    const targetMetaBucket = metaTargetData[inferredArchetype];
    const targetCurve = targetMetaBucket?.curve || FALLBACK_CURVES[inferredArchetype] || FALLBACK_CURVES["Midrange Tempo"];
    const targetSource = targetMetaBucket ? 'meta' : 'fallback';
    const sampleSize = targetMetaBucket?.sampleSize || 0;

    const chartData = Object.keys(c).map(cost => ({
      cost: `${cost} Cost`,
      Actual: c[cost],
      "Inferred Target": targetCurve[cost] || 0
    }));

    let score = 100;
    const warnings: string[] = [];
    const bonuses: string[] = [];

    if (countTotal < 50) {
      score -= (50 - countTotal) * 2;
      validForEternal = false;
      validForPremier = false;
      warnings.push(`Deck contains only ${countTotal} cards (Standard minimum is 50).`);
    } else if (countTotal > 54) {
      score -= (countTotal - 50) * 1.5;
      warnings.push(`Deck count (${countTotal}) exceeds optimal 50 cards, lowering draw consistency.`);
    } else {
      bonuses.push("Optimized Deck Thickness (50-52 cards)");
    }

    if (c['2'] < 8) {
      score -= 15;
      warnings.push("Severely low 2-drop unit count. You may stumble on critical resource turn 1-2.");
    } else {
      bonuses.push("Consistent Early Game Curve Base");
    }

    if (unitCount > 0 && spaceRatio < 20) {
      score -= 10;
      warnings.push("Vulnerable to space raids (<20% space units). Control of space arena at risk.");
    } else if (unitCount > 0 && groundRatio < 25) {
      score -= 10;
      warnings.push("Lacking ground anchor units (<25% ground). Opponents may freely seize initiative.");
    } else {
      bonuses.push("Healthy Ground & Space Arena Split");
    }

    if (inferredArchetype === "Aggro Rush" && c['6+'] > 2) {
      score -= 10;
      warnings.push("Too many high-cost cards (>5 cost) for an aggressive curve profile.");
    }

    if (events > 14) {
      score -= 8;
      warnings.push("High event count may result in dead hands with no unit presence on board.");
    } else {
      bonuses.push("Strong Unit-to-Event Balance");
    }

    let grade = 'A';
    if (score >= 90) grade = 'S';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';
    else grade = 'F';

    return {
      curve: c,
      targetCurve,
      targetSource,
      sampleSize,
      chartData,
      totalCards: countTotal,
      totalUnits: unitCount,
      groundUnits,
      spaceUnits,
      events,
      upgrades,
      spaceRatio,
      groundRatio,
      avgUnitCost: avgUnitCost.toFixed(2),
      inferredArchetype,
      score: Math.max(0, Math.min(100, score)),
      grade,
      warnings,
      bonuses,
      parsedCards,
      traitCounts,
      outOfAspect,
      sets,
    };
  }, [currentDeck.main, allAspects, metaTargetData]);

  // Compute specific sideboard recommendations naming actual cards to add/remove
  const sideboardPlan = useMemo(() => {
    const { parsedCards } = analysis;
    const deckSideboard: DeckCard[] = currentDeck.side || [];

    const sortedByCostDesc = [...parsedCards].sort((a, b) => b.cost - a.cost);
    const sortedByCostAsc = [...parsedCards].sort((a, b) => a.cost - b.cost);

    const sideboardSentinels = deckSideboard.filter((c) => {
      const cost = typeof c.cost === 'number' ? c.cost : parseInt(String(c.cost || '99'), 10);
      return c.type === CardType.UNIT && cost <= 3;
    });

    const sideboardHighImpact = deckSideboard.filter((c) => {
      const cost = typeof c.cost === 'number' ? c.cost : parseInt(String(c.cost || '0'), 10);
      return c.type === CardType.EVENT || cost >= 4;
    });

    const sideboardMid = deckSideboard.filter((c) => {
      const cost = typeof c.cost === 'number' ? c.cost : parseInt(String(c.cost || '0'), 10);
      return cost >= 2 && cost <= 4;
    });

    // vs Aggro: cut slow 5+ cost units; bring in sentinels or cheap answers
    const vsAggroCuts = sortedByCostDesc.filter(c => c.type !== CardType.EVENT && c.cost >= 5).slice(0, 3);
    const vsAggroAdds = sideboardSentinels.length > 0 ? sideboardSentinels.slice(0, 3) : deckSideboard.slice(0, 3);

    // vs Control: cut low-threat 1-2 cost ground units; bring in high-impact control/disruption
    const vsControlCuts = sortedByCostAsc.filter(c => c.type === CardType.UNIT && c.cost <= 2).slice(0, 3);
    const vsControlAdds = sideboardHighImpact.length > 0 ? sideboardHighImpact.slice(0, 3) : deckSideboard.slice(0, 3);

    // vs Midrange: swap 1-of situational cards or upgrades
    const vsMidCuts = parsedCards.filter(c => c.count === 1 || c.type === CardType.UPGRADE).slice(0, 2);
    const vsMidAdds = sideboardMid.length > 0 ? sideboardMid.slice(0, 2) : deckSideboard.slice(0, 2);

    const formatCardList = (cards: DeckCard[], prefix: string) => {
      if (cards.length === 0) return `${prefix}: General flex adjustments`;
      return cards
        .map(c => `${prefix === 'Out' ? '-' : '+'}${c.count || 1} ${c.name?.split('|')[0]?.trim() || c.name}${c.cost != null ? ` (${c.cost}c)` : ''}`)
        .join(', ');
    };

    return [
      {
        matchup: "vs. Hyper Aggro",
        out: formatCardList(vsAggroCuts, 'Out'),
        in: formatCardList(vsAggroAdds, 'In'),
        outCards: vsAggroCuts,
        inCards: vsAggroAdds,
      },
      {
        matchup: "vs. Hard Control",
        out: formatCardList(vsControlCuts, 'Out'),
        in: formatCardList(vsControlAdds, 'In'),
        outCards: vsControlCuts,
        inCards: vsControlAdds,
      },
      {
        matchup: "vs. Midrange Mirror",
        out: formatCardList(vsMidCuts, 'Out'),
        in: formatCardList(vsMidAdds, 'In'),
        outCards: vsMidCuts,
        inCards: vsMidAdds,
      },
    ];
  }, [analysis, currentDeck.side]);

  // Execute AI Coach Analysis via Edge /api/coach with graceful heuristic fallback
  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setActiveTab('ai');

    setTimeout(() => {
      document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    const payload = {
      archetype: analysis.inferredArchetype,
      leader: leaderName + ' - ' + leaderSubtitle + " (" + leaderRawId + ")",
      base: baseName + ' - ' + baseSubtitle + " (" + baseRawId + ")",
      aspects: allAspects,
      totalCards: analysis.totalCards,
      avgUnitCost: analysis.avgUnitCost,
      groundRatio: analysis.groundRatio,
      spaceRatio: analysis.spaceRatio,
      curve: analysis.curve,
      deckList: rawDeckInput,
    };

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(150000),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.analysis && data.source === 'gemini') {
        setAiAnalysis(data.analysis);
        setAiSource('gemini');
        setAiError(null);
        setIsAnalyzing(false);
        return;
      } else if (data.error && data.configured) {
        setAiError(data.error);
      } else {
        setAiError(null);
      }
    } catch (err: any) {
      if (err?.name === 'TimeoutError') {
        setAiError("AI inference timed out after 15s — fell back to Edge Heuristic Engine");
      } else {
        setAiError(err?.message || "Could not reach edge /api/coach endpoint");
      }
    }

    // Heuristic Edge fallback when GEMINI_API_KEY is not configured
    const isAggro = analysis.inferredArchetype.includes('Aggro');
    const isControl = analysis.inferredArchetype.includes('Control');
    const hasSpaceBias = analysis.spaceRatio > 40;
    const hasGroundBias = analysis.groundRatio > 70;

    const mulliganNotes = isAggro
      ? [
          "Priority 1: Mulligan aggressively for 1-cost and 2-cost ground units to guarantee turn-1 initiative.",
          "Priority 2: Ensure you have an aggressive reach event (e.g. direct base damage or attack buff) for turns 3-4.",
          "Redraw: Pitch high-cost 5+ cards immediately if they appear in your opening hand."
        ]
      : isControl
      ? [
          "Priority 1: Keep at least 1 cheap removal event or sentinel to stall the opponent's opening round blitz.",
          "Priority 2: Hold card-draw or ramp infrastructure to accelerate into late-game leader deployment.",
          "Redraw: Pitch situational late-game bombs early to guarantee hitting your resource curve every turn."
        ]
      : [
          "Priority 1: Look for on-curve 2-cost and 3-cost units that contest both ground and space arenas.",
          "Priority 2: Keep action-compression cards to seize initiative going into leadership deployment turn.",
          "Redraw: Resource situational answers that don't match the opponent's visible leader color profile."
        ];

    const tacticalNotes = [
      `Leader Synergy: Leverage ${leaderName}${leaderSubtitle ? ` (${leaderSubtitle})` : ''} at key deployment resource points to swing tempo.`,
      `Arena Split: ${analysis.groundRatio}% Ground / ${analysis.spaceRatio}% Space. ${
        hasSpaceBias ? 'Strong space lane presence allows evading heavy ground blockers.' :
        hasGroundBias ? 'Heavy ground presence demands vigilance against space raid flankers.' :
        'Balanced dual-arena coverage allows contesting wherever the opponent is weakest.'
      }`,
      `Resource Curve: Average unit cost of ${analysis.avgUnitCost} requires aiming for ${isAggro ? 'quick 5-resource games' : isControl ? 'extended 7+ resource games' : '6-resource leader deployment'}.`
    ];

    setAiAnalysis({
      summary: `Tactical Edge Assessment: Your deck exhibits a competitive ${analysis.inferredArchetype} profile running ${leaderName}${leaderSubtitle ? ` (${leaderSubtitle})` : ''} on ${baseName} (${allAspects.join(', ')}). Average unit cost is ${analysis.avgUnitCost} across ${analysis.totalCards} cards.`,
      mulligan: mulliganNotes,
      tactics: tacticalNotes,
      sideboardPlan: sideboardPlan.map(p => ({
        matchup: p.matchup,
        out: p.out,
        in: p.in,
      })),
    });
    setAiSource('heuristic');
    setIsAnalyzing(false);
  };

  return (
    <>
      <Seo
        title="SWU Deck Grader | Murder of Porgs"
        description="Evaluate your Star Wars: Unlimited deck lists against top tournament archetypes."
        path="/deckgrader"
      />
      <div className="w-full max-w-7xl mx-auto space-y-8 text-left text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
        
        {/* HEADER BAR */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-xl">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-3 rounded-xl shadow-lg shadow-cyan-500/20">
              <Crosshair className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider text-slate-100 flex items-center gap-3">
                SWU DECK GRADER 
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold tracking-wide">
                  AUTOMATED ARCHETYPE INFERENCE
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Evaluate your Star Wars: Unlimited deck lists against top tournament archetypes.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-300 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800/80 shadow-inner">
            <span className="flex items-center gap-2"><Database size={15} className="text-emerald-400" /> Cached Cards: <span className="font-bold text-white">{fetchStats.cached}</span></span>
          </div>
        </header>

        {/* PRESET SELECTORS */}
        <section className="space-y-3 bg-slate-900/50 backdrop-blur-sm p-5 rounded-2xl border border-slate-800/70 shadow-sm">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
            <Swords size={15} className="text-amber-400" /> Loaded Meta Archetypes (from Cache):
          </label>
          <div className="flex flex-wrap gap-2.5">
            {presetKeys.length > 0 ? presetKeys.map((key) => (
              <button
                key={key}
                onClick={() => handleSelectPreset(key)}
                className={`px-3.5 py-2 rounded-xl font-medium text-xs transition-all flex items-center gap-2 cursor-pointer ${
                  selectedPreset === key 
                    ? 'bg-cyan-600 text-slate-950 font-bold shadow-lg shadow-cyan-950/50 ring-2 ring-cyan-400/50 scale-[1.02]' 
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600'
                }`}
              >
                {metaDecks[key].metadata?.name || key}
              </button>
            )) : (
              <p className="text-xs text-gray-500 italic">No cached meta decks found.</p>
            )}
          </div>
        </section>

        {/* TOP DECK SCORE OVERVIEW & INFERRED ARCHETYPE BANNER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT: DECKLIST INPUT AREA */}
          <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 flex flex-col space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" /> Deck List Input
              </label>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">{analysis.totalCards} cards</span>
            </div>

            {/* SWUDB IMPORT BOX */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => { setImportUrl(e.target.value); setImportError(''); }}
                  placeholder="Paste SWUDB URL (e.g. swudb.com/deck/view/...) or ID..."
                  className="flex-1 bg-slate-950/90 border border-slate-800/90 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder:text-slate-600"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSwudbImport(); }}
                />
                <button
                  onClick={handleSwudbImport}
                  disabled={importLoading || !importUrl.trim()}
                  className="px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Download size={13} className={importLoading ? "animate-spin" : ""} />
                  {importLoading ? "Loading..." : "Import"}
                </button>
              </div>
              {importError && (
                <p className="text-[11px] text-red-400 font-medium pl-1">{importError}</p>
              )}
            </div>

            <textarea
              value={rawDeckInput}
              onChange={(e) => handleDeckInputChange(e.target.value)}
              rows={11}
              className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none shadow-inner"
              placeholder="Paste decklist (e.g. '3x Luke Skywalker') or import above..."
            />
            <button 
              onClick={runAiAnalysis}
              disabled={isAnalyzing}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/30 transition-all text-xs tracking-wide cursor-pointer"
            >
              <Cpu size={16} className={isAnalyzing ? "animate-spin" : ""} />
              {isAnalyzing ? "Analyzing Deck Profile..." : "Run AI Edge Coach Analysis"}
            </button>
          </div>

          {/* RIGHT: GRADE, STATS & ARENA BREAKDOWN */}
          <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start md:items-center space-x-5">
                <div className={`w-20 h-20 rounded-2xl border-2 flex flex-col items-center justify-center font-black shadow-lg shrink-0 ${
                  analysis.grade === 'S' ? 'text-cyan-400 border-cyan-500/50 bg-cyan-950/40 shadow-cyan-950/50' :
                  analysis.grade === 'A' ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/30 shadow-emerald-950/50' :
                  'text-amber-400 border-amber-500/50 bg-amber-950/30 shadow-amber-950/50'
                }`}>
                  <span className="text-4xl tracking-tighter leading-none">{analysis.grade}</span>
                  <span className="text-[10px] opacity-80 uppercase tracking-widest mt-1">Grade</span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-100">{deckMeta.name || leaderName}</h2>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-semibold">
                      Inferred: {analysis.inferredArchetype}
                    </span>
                    {deckMeta.author && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 font-medium">
                        By {deckMeta.author}
                      </span>
                    )}
                  </div>

                  {/* LEADER & BASE DETAILS */}
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-cyan-400">
                        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Leader:
                      </span>
                      <span className="font-bold text-slate-100">{leaderName}</span>
                      {leaderSubtitle && (
                        <span className="text-slate-400 italic">· {leaderSubtitle}</span>
                      )}
                      {leaderCardFromCache && (
                        <button
                          onClick={() => setPreviewCard({
                            name: leaderName,
                            url: getCardImageUrl(leaderCardFromCache, leaderCard) || ''
                          })}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 ml-1 inline-flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                        >
                          <Eye size={12} /> View Art
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-cyan-400">
                        <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        Base:
                      </span>
                      <span className="font-bold text-slate-100">{baseName}</span>
                      {baseSubtitle && (
                        <span className="text-slate-400 italic">· {baseSubtitle}</span>
                      )}
                      {baseHp && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-emerald-400 border border-slate-800 font-semibold">
                          {baseHp} HP
                        </span>
                      )}
                      {baseCardFromCache && (
                        <button
                          onClick={() => setPreviewCard({
                            name: baseName,
                            url: getCardImageUrl(baseCardFromCache, baseCard) || ''
                          })}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 ml-1 inline-flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                        >
                          <Eye size={12} /> View Art
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ASPECTS LIST */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <Compass className="w-3 h-3 text-slate-400 shrink-0" />
                      Aspects:
                    </span>
                    {allAspects.length > 0 ? (
                      allAspects.map(aspect => {
                        const cfg = getAspectConfig(aspect);
                        return (
                          <span
                            key={aspect}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge} shadow-sm`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-500 italic">Unspecified</span>
                    )}
                  </div>

                  {/* SETS LIST */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <Compass className="w-3 h-3 text-slate-400 shrink-0" />
                      Sets:
                    </span>
                    {analysis.sets.size > 0 ? (
                      [...analysis.sets].map(set => {
                        const cfg = getSetConfig(set);
                        return (
                          <span
                            key={set}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge} shadow-sm`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-500 italic">Unspecified</span>
                    )}
                  </div>

                  {/* STATS ROW */}
                  <div className="flex items-center space-x-5 pt-2 border-t border-slate-800/60">
                    <div className="text-xs text-slate-300">
                      Score: <span className="font-bold text-cyan-400 text-sm">{analysis.score}/100</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Avg Unit Cost: <span className="font-bold text-white text-sm">{analysis.avgUnitCost}</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Units: <span className="font-bold text-emerald-400 text-sm">{analysis.totalUnits}</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Out of Aspect: <span className="font-bold text-emerald-400 text-sm">{analysis.outOfAspect}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ARENA SPLIT */}
              <div className="w-full md:w-64 bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-2.5 shadow-inner shrink-0">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-cyan-400">Ground ({analysis.groundUnits})</span>
                  <span className="text-purple-400">Space ({analysis.spaceUnits})</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex p-0.5 bg-slate-900">
                  <div style={{ width: `${analysis.groundRatio}%` }} className="bg-cyan-500 h-full rounded-l-full transition-all duration-500" />
                  <div style={{ width: `${analysis.spaceRatio}%` }} className="bg-purple-500 h-full rounded-r-full transition-all duration-500" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>{analysis.groundRatio}% Ground</span>
                  <span>{analysis.spaceRatio}% Space</span>
                </div>
              </div>
            </div>

            {/* WARNINGS & BONUSES GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 space-y-2.5 shadow-lg">
                <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Tactical Strengths
                </h3>
                <ul className="space-y-1.5">
                  {analysis.bonuses.map((b, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">•</span> <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 space-y-2.5 shadow-lg">
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Inference Warnings
                </h3>
                {analysis.warnings.length === 0 ? (
                  <p className="text-xs text-emerald-400 italic">No curve anomalies detected for this archetype.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {analysis.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-amber-500 font-bold">•</span> <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CARD GALLERY — Parsed deck with lazy card art and lightbox click */}
        {analysis.parsedCards.length > 0 && (
          <section className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" /> Deck Visual Gallery ({analysis.parsedCards.length} unique cards)
              </h3>
              <span className="text-[11px] text-slate-400 italic">Click any card to preview full art</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {analysis.parsedCards.map((card, idx) => (
                <div
                  key={`${card.id || card.name}-${idx}`}
                  onClick={() => card.imageUrl && setPreviewCard({ name: card.name, url: card.imageUrl })}
                  className="group relative bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden hover:border-cyan-500/70 hover:scale-[1.02] transition-all cursor-pointer shadow-md"
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      loading="lazy"
                      className="w-full aspect-[5/7] object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                  ) : (
                    <div className="w-full aspect-[5/7] bg-slate-900 flex items-center justify-center p-2">
                      <span className="text-[10px] text-slate-400 text-center font-medium">{card.name}</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-2.5 pt-6">
                    <p className="text-[11px] font-semibold text-slate-100 leading-tight truncate">{card.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-slate-400">{formatCardTypeLabel(card.type)} · {card.cost}c</span>
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-800/60">×{card.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* DETAILED TABS SECTION */}
        <div id="tabs-section" className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex border-b border-slate-800/80 bg-slate-950/80 overflow-x-auto">
            {[
              { id: 'overview', label: 'Curve Visualizer', icon: BarChart3 },
              { id: 'matchup', label: 'Meta Matchup Strategy', icon: TrendingUp },
              { id: 'sideboard', label: 'Sideboard Swap Guide', icon: ArrowRightLeft },
              { id: 'ai', label: 'AI Tactical Coach', icon: Sparkles }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2.5 px-6 py-4 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-cyan-500 text-cyan-400 bg-slate-900/90 shadow-sm'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-6 md:p-8">
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                        Resource Curve vs. Inferred Target ({analysis.inferredArchetype})
                      </h3>
                      <button 
                        onClick={() => setShowTargetExplainer(!showTargetExplainer)}
                        className="text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                        title="How are target numbers derived?"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Comparing your actual distribution against {analysis.targetSource === 'meta' 
                        ? `averaged top-8 tournament meta (${analysis.sampleSize} cached decks)`
                        : 'standard 50-card competitive baseline model'}.
                    </p>
                  </div>
                  <div className="flex items-center space-x-5 text-xs bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-cyan-500 rounded-sm shadow-sm" /><span className="text-slate-300 font-medium">Your Deck</span></div>
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-slate-700 rounded-sm" /><span className="text-slate-400 font-medium">Inferred Target</span></div>
                  </div>
                </div>

                {/* TARGET NUMBERS EXPLAINER */}
                {showTargetExplainer && (
                  <div className="bg-slate-950/90 border border-cyan-800/50 rounded-xl p-4 text-xs space-y-2 text-slate-300">
                    <div className="flex justify-between items-center text-cyan-400 font-bold">
                      <span>How Inferred Target Numbers Work</span>
                      <button onClick={() => setShowTargetExplainer(false)} className="hover:text-cyan-200 cursor-pointer">
                        <X size={14} />
                      </button>
                    </div>
                    <p className="leading-relaxed">
                      Target curve numbers are computed dynamically by classifying cached top-8 tournament decklists from <code className="text-cyan-300">meta-decks.json</code> into archetypes based on their early game card count (1 & 2 drops) and average unit cost.
                    </p>
                    <p className="leading-relaxed text-slate-400">
                      When tournament lists are present, their cost distributions are averaged to establish a real-world meta baseline. If no matching archetype decks are in cache, the system falls back to standard 50-card competitive curve targets (e.g., Aggro Rush prioritizes 18+ 1-2 drops, Hard Control favors 12+ 5+ bombs).
                    </p>
                  </div>
                )}

                <div className="w-full h-72 pt-4 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysis.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="cost" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', color: '#f8fafc', fontSize: '12px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }} />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="Actual" fill="#06b6d4" name="Your Deck" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Inferred Target" fill="#334155" name="Inferred Target" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeTab === 'matchup' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-2.5 shadow-md">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span> vs. Hyper Aggro
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">Prioritize early ground sentinels and instant removal events to survive the opening blitz.</p>
                </div>
                <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-2.5 shadow-md">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span> vs. Midrange Value
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">Contest leadership deployment turns using action-compression events to seize tempo.</p>
                </div>
                <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-2.5 shadow-md">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span> vs. Hard Control
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">Apply dual-arena pressure without over-extending into mass board wipe events.</p>
                </div>
              </div>
            )}

            {activeTab === 'sideboard' && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Sideboard Swap Guide</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Named card cuts and additions derived by cross-referencing your deck against tournament sideboards.</p>
                  </div>
                  {currentDeck.side && currentDeck.side.length > 0 && (
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-semibold">
                      {currentDeck.side.length} sideboard cards available
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-2xl bg-slate-950/90 overflow-hidden shadow-md">
                  {sideboardPlan.map((plan, idx) => (
                    <div key={idx} className="p-4 md:p-5 space-y-3 text-xs">
                      <span className="font-bold text-cyan-400 text-sm">{plan.matchup}</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-red-950/30 border border-red-900/30 p-3.5 rounded-xl space-y-2">
                          <span className="text-red-400 font-semibold text-[10px] uppercase tracking-wider block">Cut Candidates (Out)</span>
                          {plan.outCards.length > 0 ? (
                            <ul className="space-y-1.5">
                              {plan.outCards.map((card, ci) => (
                                <li key={ci} className="flex items-center justify-between text-red-300">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">-{card.count || 1}</span>
                                    <span className="font-medium">{card.name}</span>
                                    <span className="text-red-400/60 text-[10px]">({card.cost}c {formatCardTypeLabel(card.type)})</span>
                                  </div>
                                  {card.imageUrl && (
                                    <button
                                      onClick={() => setPreviewCard({ name: card.name, url: card.imageUrl! })}
                                      className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer"
                                      title="View Card"
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-red-400/60 italic text-[11px]">No specific cuts identified</p>
                          )}
                        </div>
                        <div className="bg-emerald-950/30 border border-emerald-900/30 p-3.5 rounded-xl space-y-2">
                          <span className="text-emerald-400 font-semibold text-[10px] uppercase tracking-wider block">Add Candidates (In)</span>
                          {plan.inCards.length > 0 ? (
                            <ul className="space-y-1.5">
                              {plan.inCards.map((card, ci) => (
                                <li key={ci} className="flex items-center justify-between text-emerald-300">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">+{card.count || 1}</span>
                                    <span className="font-medium">{card.name?.split('|')[0]?.trim() || card.name}</span>
                                    <span className="text-emerald-400/60 text-[10px]">({card.cost}c {formatCardTypeLabel(card.type)})</span>
                                  </div>
                                  {card.imageUrl && (
                                    <button
                                      onClick={() => setPreviewCard({ name: card.name, url: card.imageUrl! })}
                                      className="text-emerald-400 hover:text-emerald-300 text-[10px] cursor-pointer"
                                      title="View Card"
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-emerald-400/60 italic text-[11px]">No matching sideboard cards in pool</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-950/90 p-5 rounded-2xl border border-slate-800/90 shadow-md">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">AI Strategic Edge Coach</span>
                    {aiSource === 'gemini' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">
                        Powered by Gemini Edge LLM
                      </span>
                    )}
                    {aiSource === 'heuristic' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-semibold" title="Add GEMINI_API_KEY secret to enable live LLM">
                        Edge Heuristic Engine
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={runAiAnalysis} 
                    disabled={isAnalyzing} 
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Cpu size={14} className={isAnalyzing ? "animate-spin" : ""} />
                    {isAnalyzing ? "Analyzing..." : "Refresh Analysis"}
                  </button>
                </div>

                {aiError && (
                  <div className="bg-red-950/60 border border-red-800/80 rounded-xl p-3.5 text-xs text-red-200 flex items-start gap-2.5 shadow-md">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-red-300 block">Gemini API Error (fell back to Edge Heuristics):</span>
                      <p className="text-[11px] text-red-200/90 leading-relaxed font-mono">{aiError}</p>
                    </div>
                  </div>
                )}
                {isAnalyzing ? (
                  <div className="bg-slate-950/90 p-8 rounded-2xl border border-slate-800/90 text-center space-y-3">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent" />
                    <p className="text-xs text-slate-400">{STAR_WARS_LOADING_PHRASES[loadingPhraseIdx]}</p>
                  </div>
                ) : aiAnalysis ? (
                  <div className="bg-slate-950/90 p-6 rounded-2xl border border-slate-800/90 text-xs text-slate-300 space-y-4 leading-relaxed shadow-md">
                    <p className="font-semibold text-slate-100 text-sm leading-relaxed">{aiAnalysis.summary}</p>
                    
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <h4 className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">Recommended Mulligan Priorities</h4>
                      <ul className="space-y-1.5">
                        {aiAnalysis.mulligan.map((m: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-cyan-400 font-bold">•</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {aiAnalysis.tactics && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-2">
                        <h4 className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">Tactical Gameplay Advice</h4>
                        <ul className="space-y-1.5">
                          {aiAnalysis.tactics.map((t: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-amber-400 font-bold">•</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.sideboardPlan && aiAnalysis.sideboardPlan.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-2">
                        <h4 className="font-bold text-purple-400 uppercase tracking-wider text-[11px]">Sideboard Plan</h4>
                        <div className="space-y-2">
                          {aiAnalysis.sideboardPlan.map((p: any, i: number) => (
                            <div key={i} className="bg-slate-900/60 rounded-lg p-3 space-y-1">
                              <span className="font-bold text-slate-200">{p.matchup}</span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                <span className="text-red-300">{p.out}</span>
                                <span className="text-emerald-300">{p.in}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950/90 p-8 rounded-2xl border border-slate-800/90 text-center space-y-2">
                    <p className="text-xs text-slate-400">Click &quot;Run AI Edge Coach Analysis&quot; above to generate strategic advice for this deck.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CARD ART PREVIEW LIGHTBOX */}
        {previewCard && (
          <div 
            onClick={() => setPreviewCard(null)}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 max-w-sm w-full space-y-3 shadow-2xl relative"
            >
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-200 truncate">{previewCard.name}</h4>
                <button onClick={() => setPreviewCard(null)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <div className="w-full aspect-[5/7] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                <img 
                  src={previewCard.url} 
                  alt={previewCard.name}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}