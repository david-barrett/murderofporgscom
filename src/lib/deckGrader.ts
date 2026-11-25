import {
  CardType,
  type CardCache,
  type DeckCard,
  type RawCard,
  getCardImageUrl,
  mapCardType,
  normalizeCardId,
  parseMetaDeck,
} from "./decks";
import { ETERNAL_BAN_LIST, PREMIER_BAN_LIST } from "../react-app/lib/consts";

export interface DeckMetaInfo {
  name: string;
  author: string;
  winRate?: string;
}

export interface MetaTargetBucket {
  curve: Record<string, number>;
  sampleSize: number;
}

export interface ChartDataPoint {
  cost: string;
  Actual: number;
  "Inferred Target": number;
}

export interface DeckAnalysis {
  curve: Record<string, number>;
  targetCurve: Record<string, number>;
  targetSource: "meta" | "fallback";
  sampleSize: number;
  chartData: ChartDataPoint[];
  totalCards: number;
  totalUnits: number;
  groundUnits: number;
  spaceUnits: number;
  events: number;
  upgrades: number;
  spaceRatio: number;
  groundRatio: number;
  avgUnitCost: string;
  inferredArchetype: string;
  score: number;
  grade: string;
  warnings: string[];
  bonuses: string[];
  parsedCards: DeckCard[];
  traitCounts: Record<string, number>;
  outOfAspect: number;
  sets: Set<string>;
  validForPremier: boolean;
  validForEternal: boolean;
}

export interface SideboardMatchupPlan {
  matchup: string;
  out: string;
  in: string;
  outCards: DeckCard[];
  inCards: DeckCard[];
}

export interface AiCoachAnalysis {
  summary: string;
  mulligan: string[];
  tactics?: string[];
  sideboardPlan?: Array<{ matchup: string; out: string; in: string }>;
}

// Hardcoded competitive baseline curves
export const FALLBACK_CURVES: Record<string, Record<string, number>> = {
  "Aggro Rush": { "1": 9, "2": 18, "3": 12, "4": 6, "5": 3, "6+": 2 },
  "Hard Control Ramp": { "1": 3, "2": 8, "3": 10, "4": 9, "5": 8, "6+": 12 },
  "Space Swarm Tempo": { "1": 6, "2": 15, "3": 14, "4": 8, "5": 4, "6+": 3 },
  "Midrange Tempo": { "1": 4, "2": 12, "3": 12, "4": 8, "5": 6, "6+": 8 },
};

/** Look up a card in the cache by ID (padded or unpadded), name, or SET_NUM. */
export function findCardData(
  identifier: string,
  cardCache: CardCache
): RawCard | null {
  if (!identifier) return null;
  const cleanId = String(identifier).trim().toUpperCase();
  if (cardCache[cleanId]) return cardCache[cleanId];

  const m = cleanId.match(/^([A-Z0-9]+)_0*(\d+)$/);
  if (m) {
    const paddedKey = `${m[1]}_${m[2].padStart(3, "0")}`;
    if (cardCache[paddedKey]) return cardCache[paddedKey];
    const unpaddedKey = `${m[1]}_${m[2]}`;
    if (cardCache[unpaddedKey]) return cardCache[unpaddedKey];
  }

  const found = Object.values(cardCache).find(
    (v) =>
      v.name?.toUpperCase() === cleanId ||
      (v.set && `${v.set}_${v.number}`.toUpperCase() === cleanId) ||
      (v.set &&
        `${v.set}_${parseInt(String(v.number), 10)}`.toUpperCase() === cleanId)
  );
  return found || null;
}

/** Classify a deck by archetype based on its cost and unit distribution. */
export function classifyArchetype(
  costDist: Record<string, number>,
  totalUnits: number,
  costSum: number,
  spaceUnits: number
): string {
  const avgUnitCost = totalUnits > 0 ? costSum / totalUnits : 0;
  const spaceRatio =
    totalUnits > 0 ? Math.round((spaceUnits / totalUnits) * 100) : 0;
  const earlyGame = (costDist["1"] || 0) + (costDist["2"] || 0);
  const lateGame = (costDist["5"] || 0) + (costDist["6+"] || 0);

  if (earlyGame >= 18 && avgUnitCost <= 2.6) return "Aggro Rush";
  if (lateGame >= 12 && avgUnitCost >= 3.6) return "Hard Control Ramp";
  if (spaceRatio >= 55) return "Space Swarm Tempo";
  return "Midrange Tempo";
}

/** Compute target curves by averaging meta deck distributions, grouped by archetype. */
export function computeMetaTargetCurves(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metaDecks: Record<string, any>,
  cardCache: CardCache
): Record<string, MetaTargetBucket> {
  const archetypeBuckets: Record<
    string,
    { curves: Record<string, number>[]; count: number }
  > = {};

  for (const key of Object.keys(metaDecks)) {
    const rawMetaDeck = metaDecks[key];
    if (!rawMetaDeck) continue;

    const parsedDeck = parseMetaDeck(rawMetaDeck, cardCache);
    if (!parsedDeck.main || parsedDeck.main.length === 0) continue;

    const c: Record<string, number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
      "6+": 0,
    };
    let unitCount = 0;
    let costSum = 0;
    let spaceUnits = 0;

    for (const item of parsedDeck.main) {
      const qty = item.count || item.quantity || 1;
      const cost =
        typeof item.cost === "number"
          ? item.cost
          : parseInt(String(item.cost || "2"), 10);
      const costKey = cost >= 6 ? "6+" : String(cost);
      c[costKey] = (c[costKey] || 0) + qty;

      if (item.type === CardType.UNIT) {
        unitCount += qty;
        costSum += cost * qty;
        if (item.arena.toLowerCase() === "space") spaceUnits += qty;
      }
    }

    const archetype = classifyArchetype(c, unitCount, costSum, spaceUnits);
    if (!archetypeBuckets[archetype]) {
      archetypeBuckets[archetype] = { curves: [], count: 0 };
    }
    archetypeBuckets[archetype].curves.push(c);
    archetypeBuckets[archetype].count += 1;
  }

  const result: Record<string, MetaTargetBucket> = {};
  const keys = ["1", "2", "3", "4", "5", "6+"];
  for (const [archetype, bucket] of Object.entries(archetypeBuckets)) {
    const avg: Record<string, number> = {};
    for (const k of keys) {
      const total = bucket.curves.reduce(
        (sum, curve) => sum + (curve[k] || 0),
        0
      );
      avg[k] = Math.round(total / bucket.count);
    }
    result[archetype] = { curve: avg, sampleSize: bucket.count };
  }

  return result;
}

/** Extract a SWUDB deck ID from a URL or raw ID string. */
export function extractSwudbDeckId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/deck(?:\/view)?\/([a-zA-Z0-9_-]+)/);
  const deckId = match
    ? match[1]
    : trimmed.replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+/, "");

  if (!/^[a-zA-Z0-9_-]+$/.test(deckId)) {
    throw new Error(
      "Please enter a valid SWUDB deck URL or alphanumeric ID (e.g. ABCD1234)."
    );
  }
  return deckId;
}

/** Parse multiline decklist text (e.g. "3x 0-0-0 (LAW_174)") into DeckCard entries. */
export function parseDeckListText(
  nextText: string,
  existingMain: DeckCard[],
  cardCache: CardCache
): DeckCard[] {
  const nextMain: DeckCard[] = [];
  const lineRegex = /^(\d+)x?\s+(.+?)(?:\s+\(([^)]+)\))?$/i;

  for (const rawLine of nextText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(lineRegex);
    if (!match) continue;

    const qty = parseInt(match[1], 10) || 1;
    const namePart = match[2].trim();
    const idPart = match[3]?.trim();
    const lookupKey = idPart || namePart;
    const cached = findCardData(lookupKey, cardCache);
    const existing = existingMain.find(
      (c) =>
        (idPart && normalizeCardId(c.id) === normalizeCardId(idPart)) ||
        c.name.toLowerCase() === namePart.toLowerCase()
    );

    const normalizedId = normalizeCardId(
      idPart ||
        existing?.id ||
        (cached?.set && cached?.number ? `${cached.set}_${cached.number}` : "")
    );

    const parsedType = cached?.type
      ? mapCardType(cached.type)
      : (existing?.type ?? CardType.UNIT);

    const parsedCost =
      cached?.cost !== undefined
        ? Number(cached.cost)
        : (existing?.cost ?? 2);

    const parsedArena = String(
      cached?.arenas?.[0] ?? cached?.arena ?? existing?.arena ?? "Ground"
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
      power:
        cached?.power !== undefined ? Number(cached.power) : existing?.power,
      set: String(cached?.set ?? existing?.set ?? ""),
      number: String(cached?.number ?? existing?.number ?? ""),
      imageUrl: getCardImageUrl(cached, existing),
      aspects: parsedAspects,
      text: cached?.text ?? existing?.text,
      unique: Boolean(cached?.unique ?? existing?.unique ?? false),
    });
  }

  return nextMain;
}

/** Analyze a deck's curve, arena split, format legality, and overall competitive score. */
export function analyzeDeck(
  main: DeckCard[],
  allAspects: string[],
  cardCache: CardCache,
  metaTargetData: Record<string, MetaTargetBucket>
): DeckAnalysis {
  const c: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6+": 0,
  };
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
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayStr = `${year}_${month}_${day}`;

  const allAspectsSet = new Set(allAspects);

  for (const item of main) {
    const qty = item.count || item.quantity || 1;
    const cardId = normalizeCardId(item.id);
    const cached = findCardData(cardId || item.name, cardCache);

    if (qty > 3) {
      validForEternal = false;
      validForPremier = false;
    }

    const rawCost = item.cost ?? cached?.cost ?? 2;
    const cost =
      typeof rawCost === "number"
        ? rawCost
        : parseInt(String(rawCost || "2"), 10);
    const safeCost = Number.isNaN(cost) ? 2 : cost;
    const costKey = safeCost >= 6 ? "6+" : String(safeCost);
    c[costKey] = (c[costKey] || 0) + qty;
    countTotal += qty;

    const cardType = item.type ?? mapCardType(cached?.type);
    if (cardType === CardType.UNIT) {
      unitCount += qty;
      costSum += safeCost * qty;
      const arena = (
        item.arena ||
        cached?.arena ||
        cached?.arenas?.[0] ||
        ""
      ).toLowerCase();
      if (arena === "space") spaceUnits += qty;
      else groundUnits += qty;
    } else if (cardType === CardType.EVENT) {
      events += qty;
    } else if (cardType === CardType.UPGRADE) {
      upgrades += qty;
    }

    const traits =
      item.traits.length > 0
        ? item.traits
        : Array.isArray(cached?.traits)
          ? cached.traits
          : [];
    traits.forEach((t: string) => {
      traitCounts[t] = (traitCounts[t] || 0) + qty;
    });

    const cardSet = item.set || cached?.set || "";
    if (cardSet) {
      sets.add(cardSet);
    }

    const aspects =
      item.aspects.length > 0
        ? item.aspects
        : Array.isArray(cached?.aspects)
          ? cached.aspects
          : [];
    if (aspects.some((t: string) => !allAspectsSet.has(t))) {
      outOfAspect += qty;
    }

    if (validForEternal) {
      const bannedCard = ETERNAL_BAN_LIST[cardId] || ETERNAL_BAN_LIST[item.name];
      if (bannedCard && bannedCard.ban_date < todayStr) {
        if (!bannedCard.unban_date || bannedCard.unban_date > todayStr) {
          validForEternal = false;
        }
      }
    }
    if (validForPremier) {
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
      name: item.name || cached?.name || cardId || "Unknown Card",
      count: qty,
      quantity: qty,
      cost: safeCost,
      type: cardType,
      arena: item.arena || cached?.arena || cached?.arenas?.[0] || "Ground",
      traits,
      set: cardSet,
      number: item.number || cached?.number || "",
      imageUrl: getCardImageUrl(cached, item),
      aspects,
      unique: Boolean(item.unique ?? cached?.unique ?? false),
    });
  }

  const avgUnitCost = unitCount > 0 ? costSum / unitCount : 0;
  const spaceRatio =
    unitCount > 0 ? Math.round((spaceUnits / unitCount) * 100) : 0;
  const groundRatio =
    unitCount > 0 ? Math.round((groundUnits / unitCount) * 100) : 0;

  const inferredArchetype = classifyArchetype(c, unitCount, costSum, spaceUnits);

  const targetMetaBucket = metaTargetData[inferredArchetype];
  const targetCurve =
    targetMetaBucket?.curve ||
    FALLBACK_CURVES[inferredArchetype] ||
    FALLBACK_CURVES["Midrange Tempo"];
  const targetSource = targetMetaBucket ? "meta" : "fallback";
  const sampleSize = targetMetaBucket?.sampleSize || 0;

  const chartData: ChartDataPoint[] = Object.keys(c).map((cost) => ({
    cost: `${cost} Cost`,
    Actual: c[cost],
    "Inferred Target": targetCurve[cost] || 0,
  }));

  let score = 100;
  const warnings: string[] = [];
  const bonuses: string[] = [];

  if (countTotal < 50) {
    score -= (50 - countTotal) * 2;
    validForEternal = false;
    validForPremier = false;
    warnings.push(
      `Deck contains only ${countTotal} cards (Standard minimum is 50).`
    );
  } else if (countTotal > 54) {
    score -= (countTotal - 50) * 1.5;
    warnings.push(
      `Deck count (${countTotal}) exceeds optimal 50 cards, lowering draw consistency.`
    );
  } else {
    bonuses.push("Optimized Deck Thickness (50-52 cards)");
  }

  if (c["2"] < 8) {
    score -= 15;
    warnings.push(
      "Severely low 2-drop unit count. You may stumble on critical resource turn 1-2."
    );
  } else {
    bonuses.push("Consistent Early Game Curve Base");
  }

  if (unitCount > 0 && spaceRatio < 20) {
    score -= 10;
    warnings.push(
      "Vulnerable to space raids (<20% space units). Control of space arena at risk."
    );
  } else if (unitCount > 0 && groundRatio < 25) {
    score -= 10;
    warnings.push(
      "Lacking ground anchor units (<25% ground). Opponents may freely seize initiative."
    );
  } else {
    bonuses.push("Healthy Ground & Space Arena Split");
  }

  if (inferredArchetype === "Aggro Rush" && c["6+"] > 2) {
    score -= 10;
    warnings.push(
      "Too many high-cost cards (>5 cost) for an aggressive curve profile."
    );
  }

  if (events > 14) {
    score -= 8;
    warnings.push(
      "High event count may result in dead hands with no unit presence on board."
    );
  } else {
    bonuses.push("Strong Unit-to-Event Balance");
  }

  let grade = "A";
  if (score >= 90) grade = "S";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 60) grade = "C";
  else grade = "F";

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
    validForPremier,
    validForEternal,
  };
}

/** Build matchup-specific sideboard swap recommendations. */
export function buildSideboardPlan(
  parsedCards: DeckCard[],
  deckSideboard: DeckCard[] = []
): SideboardMatchupPlan[] {
  const sortedByCostDesc = [...parsedCards].sort((a, b) => b.cost - a.cost);
  const sortedByCostAsc = [...parsedCards].sort((a, b) => a.cost - b.cost);

  const sideboardSentinels = deckSideboard.filter((c) => {
    const cost =
      typeof c.cost === "number"
        ? c.cost
        : parseInt(String(c.cost || "99"), 10);
    return c.type === CardType.UNIT && cost <= 3;
  });

  const sideboardHighImpact = deckSideboard.filter((c) => {
    const cost =
      typeof c.cost === "number" ? c.cost : parseInt(String(c.cost || "0"), 10);
    return c.type === CardType.EVENT || cost >= 4;
  });

  const sideboardMid = deckSideboard.filter((c) => {
    const cost =
      typeof c.cost === "number" ? c.cost : parseInt(String(c.cost || "0"), 10);
    return cost >= 2 && cost <= 4;
  });

  const vsAggroCuts = sortedByCostDesc
    .filter((c) => c.type !== CardType.EVENT && c.cost >= 5)
    .slice(0, 3);
  const vsAggroAdds =
    sideboardSentinels.length > 0
      ? sideboardSentinels.slice(0, 3)
      : deckSideboard.slice(0, 3);

  const vsControlCuts = sortedByCostAsc
    .filter((c) => c.type === CardType.UNIT && c.cost <= 2)
    .slice(0, 3);
  const vsControlAdds =
    sideboardHighImpact.length > 0
      ? sideboardHighImpact.slice(0, 3)
      : deckSideboard.slice(0, 3);

  const vsMidCuts = parsedCards
    .filter((c) => c.count === 1 || c.type === CardType.UPGRADE)
    .slice(0, 2);
  const vsMidAdds =
    sideboardMid.length > 0
      ? sideboardMid.slice(0, 2)
      : deckSideboard.slice(0, 2);

  const formatCardList = (cards: DeckCard[], prefix: string) => {
    if (cards.length === 0) return `${prefix}: General flex adjustments`;
    return cards
      .map(
        (c) =>
          `${prefix === "Out" ? "-" : "+"}${c.count || 1} ${c.name?.split("|")[0]?.trim() || c.name}${c.cost != null ? ` (${c.cost}c)` : ""}`
      )
      .join(", ");
  };

  return [
    {
      matchup: "vs. Hyper Aggro",
      out: formatCardList(vsAggroCuts, "Out"),
      in: formatCardList(vsAggroAdds, "In"),
      outCards: vsAggroCuts,
      inCards: vsAggroAdds,
    },
    {
      matchup: "vs. Hard Control",
      out: formatCardList(vsControlCuts, "Out"),
      in: formatCardList(vsControlAdds, "In"),
      outCards: vsControlCuts,
      inCards: vsControlAdds,
    },
    {
      matchup: "vs. Midrange Mirror",
      out: formatCardList(vsMidCuts, "Out"),
      in: formatCardList(vsMidAdds, "In"),
      outCards: vsMidCuts,
      inCards: vsMidAdds,
    },
  ];
}

/** Generate heuristic strategic coaching advice when the LLM endpoint is unavailable. */
export function buildHeuristicAnalysis(params: {
  analysis: DeckAnalysis;
  leaderName: string;
  leaderSubtitle: string;
  baseName: string;
  allAspects: string[];
  sideboardPlan: SideboardMatchupPlan[];
}): AiCoachAnalysis {
  const {
    analysis,
    leaderName,
    leaderSubtitle,
    baseName,
    allAspects,
    sideboardPlan,
  } = params;
  const isAggro = analysis.inferredArchetype.includes("Aggro");
  const isControl = analysis.inferredArchetype.includes("Control");
  const hasSpaceBias = analysis.spaceRatio > 40;
  const hasGroundBias = analysis.groundRatio > 70;

  const mulliganNotes = isAggro
    ? [
        "Priority 1: Mulligan aggressively for 1-cost and 2-cost ground units to guarantee turn-1 initiative.",
        "Priority 2: Ensure you have an aggressive reach event (e.g. direct base damage or attack buff) for turns 3-4.",
        "Redraw: Pitch high-cost 5+ cards immediately if they appear in your opening hand.",
      ]
    : isControl
      ? [
          "Priority 1: Keep at least 1 cheap removal event or sentinel to stall the opponent's opening round blitz.",
          "Priority 2: Hold card-draw or ramp infrastructure to accelerate into late-game leader deployment.",
          "Redraw: Pitch situational late-game bombs early to guarantee hitting your resource curve every turn.",
        ]
      : [
          "Priority 1: Look for on-curve 2-cost and 3-cost units that contest both ground and space arenas.",
          "Priority 2: Keep action-compression cards to seize initiative going into leadership deployment turn.",
          "Redraw: Resource situational answers that don't match the opponent's visible leader color profile.",
        ];

  const tacticalNotes = [
    `Leader Synergy: Leverage ${leaderName}${leaderSubtitle ? ` (${leaderSubtitle})` : ""} at key deployment resource points to swing tempo.`,
    `Arena Split: ${analysis.groundRatio}% Ground / ${analysis.spaceRatio}% Space. ${
      hasSpaceBias
        ? "Strong space lane presence allows evading heavy ground blockers."
        : hasGroundBias
          ? "Heavy ground presence demands vigilance against space raid flankers."
          : "Balanced dual-arena coverage allows contesting wherever the opponent is weakest."
    }`,
    `Resource Curve: Average unit cost of ${analysis.avgUnitCost} requires aiming for ${isAggro ? "quick 5-resource games" : isControl ? "extended 7+ resource games" : "6-resource leader deployment"}.`,
  ];

  return {
    summary: `Tactical Edge Assessment: Your deck exhibits a competitive ${analysis.inferredArchetype} profile running ${leaderName}${leaderSubtitle ? ` (${leaderSubtitle})` : ""} on ${baseName} (${allAspects.join(", ")}). Average unit cost is ${analysis.avgUnitCost} across ${analysis.totalCards} cards.`,
    mulligan: mulliganNotes,
    tactics: tacticalNotes,
    sideboardPlan: sideboardPlan.map((p) => ({
      matchup: p.matchup,
      out: p.out,
      in: p.in,
    })),
  };
}
