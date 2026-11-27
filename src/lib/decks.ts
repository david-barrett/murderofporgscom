import { MAX_MULLIGAN_OVERRIDES, STARTING_HAND_MODIFIERS } from '../react-app/lib/consts'

export enum CardType {
  LEADER,
  BASE,
  UNIT,
  UPGRADE,
  EVENT,
}

export interface DeckCard extends Card {
  quantity: number;
}

export interface LeaderCard extends Card {
  back_text?: string;
}

export interface Card {
  id: string;
  name: string;
  subtitle?: string;
  count: number;
  cost: number;
  type: CardType;
  arena: string;
  traits: string[];
  hp?: number;
  power?: number;
  set: string;
  number: string;
  imageUrl: string | null;
  aspects: string[];
  text?: string;
  unique: boolean;
}

export interface ParsedCard {
  name: string;
  count: number;
  cost: number;
  type: string;
  arena: string;
  traits: string[];
  set: string;
  number: string;
  imageUrl: string | null;
  aspects: string[];
  unique: boolean;
}

export interface Deck {
  leader: LeaderCard;
  base: Card;
  main: DeckCard[];
  side: DeckCard[];
}

export type DrawnCard = {
  id?: string;
  name: string;
  cost: number;
  type?: CardType | string;
  imageUrl?: string | null;
};

export type CardCache = Record<string, RawCard>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawCard = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawDeck = Record<string, any>;

export function mapCardType(rawType: unknown): CardType {
  if (typeof rawType === "number" && rawType in CardType) {
    return rawType as CardType;
  }

  const normalized = String(rawType ?? "").toUpperCase();
  switch (normalized) {
    case "LEADER":
      return CardType.LEADER;
    case "BASE":
      return CardType.BASE;
    case "UNIT":
      return CardType.UNIT;
    case "UPGRADE":
      return CardType.UPGRADE;
    case "EVENT":
      return CardType.EVENT;
    default:
      return CardType.UNIT;
  }
}

export function formatCardTypeLabel(type: CardType | string): string {
  if (typeof type === "number") {
    switch (type) {
      case CardType.LEADER:
        return "Leader";
      case CardType.BASE:
        return "Base";
      case CardType.UNIT:
        return "Unit";
      case CardType.UPGRADE:
        return "Upgrade";
      case CardType.EVENT:
        return "Event";
      default:
        return "Unit";
    }
  }
  return String(type || "Unit");
}

function resolveSetAndNumber(
  cardData?: RawCard | null,
  fallbackCard?: RawCard | null
): { set: string; number: string } | null {
  const set = fallbackCard?.set || cardData?.set;
  const number = fallbackCard?.number || cardData?.number;
  if (set && number) {
    return { set: String(set).toLowerCase(), number: String(number) };
  }

  const rawId = String(fallbackCard?.id || cardData?.id || "");
  const match = rawId.match(/^([A-Za-z0-9]+)_(\d+)$/);
  if (match) {
    return { set: match[1].toLowerCase(), number: match[2] };
  }

  return null;
}

/** Resolve an image URL for a card, preferring explicit URLs or SWUDB card image endpoints. */
export function getCardImageUrl(
  cardData?: RawCard | null,
  fallbackCard?: RawCard | null
): string | null {
  if (fallbackCard?.imageUrl) return fallbackCard.imageUrl;
  if (cardData?.imageUrl) return cardData.imageUrl;
  const sn = resolveSetAndNumber(cardData, fallbackCard);
  if (sn) {
    return `https://api.swu-db.com/cards/${sn.set}/${sn.number}?format=image`;
  }
  return null;
}

/** Resolve the deployed/unit backside image URL for a Leader card. */
export function getLeaderBackImageUrl(
  cardData?: RawCard | null,
  fallbackCard?: RawCard | null
): string | null {
  if (fallbackCard?.backImageUrl) return fallbackCard.backImageUrl;
  if (cardData?.backImageUrl) return cardData.backImageUrl;
  const sn = resolveSetAndNumber(cardData, fallbackCard);
  if (sn) {
    return `https://api.swu-db.com/cards/${sn.set}/${sn.number}?format=image&face=back`;
  }
  return null;
}

function normalizeAspectsList(rawAspects: unknown): string[] {
  if (Array.isArray(rawAspects)) {
    return rawAspects.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof rawAspects === "string") {
    return rawAspects.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseSWUDBCard(card: RawCard = {}): Card {
  const aspects = normalizeAspectsList(
    card.aspects ?? card.Aspects ?? card.aspect ?? card.Aspect ?? []
  );

  const rawTraits = card.traits ?? card.Traits ?? [];
  const traits = Array.isArray(rawTraits) ? rawTraits.map(String) : [];

  return {
    id: String(card.id ?? card.Id ?? ""),
    name: String(card.name ?? card.Name ?? ""),
    subtitle: card.subtitle ?? card.Subtitle ?? undefined,
    count: Number(card.count ?? card.Count ?? 1),
    cost: Number(card.cost ?? card.Cost ?? 0),
    type: mapCardType(card.type ?? card.Type),
    arena: String(
      card.arenas?.[0] ??
        card.Arenas?.[0] ??
        card.arena ??
        card.Arena ??
        "None"
    ),
    traits,
    hp:
      card.hp !== undefined
        ? Number(card.hp)
        : card.HP !== undefined
          ? Number(card.HP)
          : undefined,
    power:
      card.power !== undefined
        ? Number(card.power)
        : card.Power !== undefined
          ? Number(card.Power)
          : undefined,
    set: String(card.set ?? card.Set ?? ""),
    number: String(card.number ?? card.Number ?? ""),
    imageUrl: card.imageUrl ?? card.ImageUrl ?? card.image ?? null,
    aspects,
    text: card.text ?? card.Text ?? card.FrontText ?? undefined,
    unique: Boolean(card.unique ?? card.Unique ?? false),
  };
}

function getMergedCardSource(
  entry: RawCard | null | undefined,
  cache: CardCache
): { id: string; merged: RawCard } {
  const rawId = String(entry?.id ?? entry?.Id ?? entry?.cardId ?? "");
  const id = normalizeCardId(rawId);
  const cached = id ? (cache[id] ?? cache[rawId] ?? {}) : {};
  const count = Number(
    entry?.count ?? entry?.Count ?? cached.count ?? cached.Count ?? 1
  );

  return {
    id,
    merged: {
      ...cached,
      ...entry,
      id,
      count,
    },
  };
}

function resolveCardFromCache(
  entry: RawCard | null | undefined,
  cache: CardCache
): Card {
  const { merged } = getMergedCardSource(entry, cache);
  return parseSWUDBCard(merged);
}

function resolveLeaderCardFromCache(
  entry: RawCard | null | undefined,
  cache: CardCache
): LeaderCard {
  const { merged } = getMergedCardSource(entry, cache);
  const baseCard = parseSWUDBCard(merged);
  const backText =
    merged.back_text ?? merged.backText ?? merged.BackText ?? undefined;

  return {
    ...baseCard,
    type: CardType.LEADER,
    ...(backText !== undefined ? { back_text: String(backText) } : {}),
  };
}

function resolveDeckCardFromCache(
  entry: RawCard | null | undefined,
  cache: CardCache
): DeckCard {
  const card = resolveCardFromCache(entry, cache);
  return {
    ...card,
    quantity: card.count,
  };
}

export const parseSWUDBDeck = (
  data: RawDeck = {},
  cache: CardCache = {}
): Deck => {
  const mainSource = Array.isArray(data.deck)
    ? data.deck
    : Array.isArray(data.main)
      ? data.main
      : [];

  const sideSource = Array.isArray(data.sideboard)
    ? data.sideboard
    : Array.isArray(data.side)
      ? data.side
      : [];

  return {
    leader: resolveLeaderCardFromCache(data.leader ?? data.Leader ?? {}, cache),
    base: resolveCardFromCache(data.base ?? data.Base ?? {}, cache),
    main: mainSource.map((entry: RawCard) =>
      resolveDeckCardFromCache(entry, cache)
    ),
    side: sideSource.map((entry: RawCard) =>
      resolveDeckCardFromCache(entry, cache)
    ),
  };
};

const SET_NUMBER_MAP: Record<string, string> = {
  "01": "SOR",
  "02": "SHD",
  "03": "TWI",
  "04": "JTL",
  "05": "LOF",
  "06": "SEC",
  "07": "LAW",
  "08": "ASH",
  "09": "HMW",
};

export function normalizeCardId(cardId?: string | null): string {
  if (!cardId) return "";
  const trimmed = cardId.trim();
  const match = trimmed.match(/^([A-Za-z0-9]+)_(\d+)$/);
  if (!match) return trimmed;

  const [, prefix, numStr] = match;
  const paddedNum = numStr.padStart(3, "0");
  return `${prefix.toUpperCase()}_${paddedNum}`;
}

export function convertCdnIdToCacheId(cdnId?: string | null): string {
  if (!cdnId) return "";
  if (cdnId.includes("_")) return normalizeCardId(cdnId);

  // Example CDN ID: "07010179" -> Set "07", Variant "01", Number "0179"
  if (cdnId.length >= 8) {
    const setNum = cdnId.substring(0, 2);
    const cardNum = parseInt(cdnId.substring(4), 10);
    const setPrefix = SET_NUMBER_MAP[setNum] || setNum;
    return normalizeCardId(`${setPrefix}_${cardNum}`);
  }

  return normalizeCardId(cdnId);
}

function extractAndNormalizeId(
  imageUrl?: string | null,
  fallback = "UNKNOWN"
): string {
  if (!imageUrl) return fallback;
  const match = imageUrl.match(/\/([0-9A-Za-z]+)_[A-Z]{2}_/);
  if (match && match[1]) {
    return convertCdnIdToCacheId(match[1]);
  }
  return fallback;
}

export const parseMetaDeck = (
  metaDeck: RawDeck = {},
  cache: CardCache = {}
): Deck => {
  const allCards: RawCard[] = Array.isArray(metaDeck.cards)
    ? metaDeck.cards
    : [];

  const mapSectionItems = (sectionName: string): RawCard[] =>
    allCards
      .filter((item) => item?.section === sectionName)
      .map((item) => ({
        ...(item.card ?? {}),
        id: extractAndNormalizeId(item.card?.imageUrl, "UNKNOWN"),
        count: item.count ?? 1,
      }));

  const leaderItem = allCards.find((item) => item?.section === "Leader");
  const baseItem = allCards.find((item) => item?.section === "Base");

  const leaderSource =
    metaDeck.leaderCard ?? metaDeck.leader ?? leaderItem?.card ?? {};
  const baseSource =
    metaDeck.baseCard ?? metaDeck.base ?? baseItem?.card ?? {};

  const resolvedLeaderId =
    leaderSource?.id ??
    leaderSource?.cardId ??
    extractAndNormalizeId(
      metaDeck.leaderCard?.imageUrl ?? leaderItem?.card?.imageUrl,
      "JTL_006"
    );

  const resolvedBaseId =
    baseSource?.id ??
    baseSource?.cardId ??
    extractAndNormalizeId(
      metaDeck.baseCard?.imageUrl ?? baseItem?.card?.imageUrl,
      "ASH_025"
    );

  const normalizedDeckInput: RawDeck = {
    leader: {
      ...leaderSource,
      id: normalizeCardId(String(resolvedLeaderId)),
      count: 1,
    },
    base: {
      ...baseSource,
      id: normalizeCardId(String(resolvedBaseId)),
      count: 1,
    },
    deck: Array.isArray(metaDeck.deck)
      ? metaDeck.deck
      : mapSectionItems("MainDeck"),
    sideboard: Array.isArray(metaDeck.sideboard)
      ? metaDeck.sideboard
      : mapSectionItems("Sideboard"),
  };

  return parseSWUDBDeck(normalizedDeckInput, cache);
};

export function createEmptyDeck(): Deck {
  const emptyLeader: LeaderCard = {
    id: "",
    name: "Commander",
    count: 1,
    cost: 0,
    type: CardType.LEADER,
    arena: "None",
    traits: [],
    set: "",
    number: "",
    imageUrl: null,
    aspects: [],
    unique: false,
  };

  const emptyBase: Card = {
    id: "",
    name: "Unassigned Base",
    count: 1,
    cost: 0,
    type: CardType.BASE,
    arena: "None",
    traits: [],
    set: "",
    number: "",
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

export function formatDeckMainLines(main: DeckCard[] = []): string {
  return main
    .map((item) => {
      const displayName = item.name || item.id || "Unknown Card";
      const idPart = item.id ? ` (${item.id})` : "";
      return `${item.count}x ${displayName}${idPart}`;
    })
    .join("\n");
}

export function formatDeckLines(deck: Deck): string {
  const mainText = formatDeckMainLines(deck.main);
  if (!deck.side || deck.side.length === 0) {
    return mainText;
  }
  const sideText = formatDeckMainLines(deck.side);
  return `${mainText}\n\nSideboard (${deck.side.reduce((sum, c) => sum + (c.count || 1), 0)}):\n${sideText}`;
}

export function expandMainDeckPool(cards: DeckCard[]): DrawnCard[] {
  const pool: DrawnCard[] = [];
  for (const card of cards) {
    const copies = Math.max(0, Number(card.count) || 1);
    for (let i = 0; i < copies; i++) {
      pool.push({
        id: card.id,
        name: card.name,
        cost: card.cost,
        type: card.type,
        imageUrl: card.imageUrl,
      });
    }
  }
  return pool;
}

export function getStartingHandSize(
  ...sources: Array<RawCard | Card | LeaderCard | null | undefined>
): number {
  const DEFAULT_HAND_SIZE = 6;
  let modifier = 0;
  let explicitHandSize: number | null = null;
  const seenKeys = new Set<string>();

  for (const src of sources) {
    if (!src) continue;

    const record = src as Record<string, unknown>;
    const derivedId =
      String(src.id ?? "").trim() ||
      (src.set && src.number ? `${src.set}_${src.number}` : "");
    const normalizedId = normalizeCardId(derivedId).toUpperCase();

    if (normalizedId) {
      if (seenKeys.has(normalizedId)) continue;
      seenKeys.add(normalizedId);
    }

    if (normalizedId && normalizedId in STARTING_HAND_MODIFIERS) {
      modifier += STARTING_HAND_MODIFIERS[normalizedId];
      continue;
    }

    const textBlob = [src.text, record.front_text, record.abilityText]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");

    if (!textBlob) continue;

    const addMatch = textBlob.match(
      /\bdraw\s+(\d+)\s+more\s+cards?\s+in\s+your\s+starting\s+hand\b/i
    );
    if (addMatch) {
      modifier += Number(addMatch[1]) || 0;
    }

    const setMatch = textBlob.match(
      /\bstarting\s+hand\s+(?:size\s+(?:is|becomes)\s+|of\s+)(\d+)\s+cards?\b/i
    );
    if (setMatch) {
      explicitHandSize = Number(setMatch[1]) || DEFAULT_HAND_SIZE;
    }
  }

  const baseCount = explicitHandSize ?? DEFAULT_HAND_SIZE;
  return Math.max(1, baseCount + modifier);
}

export function drawCards(pool: DrawnCard[], count: number): DrawnCard[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}

export function drawSixCards(pool: DrawnCard[]): DrawnCard[] {
  return drawCards(pool, 6);
}

export function getMaxMulligans(
  ...sources: Array<RawCard | Card | LeaderCard | null | undefined>
): number {
  const DEFAULT_MAX_MULLIGANS = 1;
  const seenKeys = new Set<string>();
  let resolvedMax: number | null = null;

  for (const src of sources) {
    if (!src) continue;

    const record = src as Record<string, unknown>;
    const derivedId =
      String(src.id ?? "").trim() ||
      (src.set && src.number ? `${src.set}_${src.number}` : "");
    const normalizedId = normalizeCardId(derivedId).toUpperCase();

    if (normalizedId) {
      if (seenKeys.has(normalizedId)) continue;
      seenKeys.add(normalizedId);
    }

    if (normalizedId && normalizedId in MAX_MULLIGAN_OVERRIDES) {
      const override = MAX_MULLIGAN_OVERRIDES[normalizedId];
      resolvedMax =
        resolvedMax === null ? override : Math.min(resolvedMax, override);
      continue;
    }

    const textBlob = [src.text, record.front_text, record.abilityText]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");

    if (!textBlob) continue;

    if (
      /\b(?:cannot|can't|may\s+not|no)\s+mulligan\b/i.test(textBlob) ||
      /\bmulligans?\s+(?:are\s+)?not\s+allowed\b/i.test(textBlob)
    ) {
      resolvedMax = resolvedMax === null ? 0 : Math.min(resolvedMax, 0);
    }
  }

  return resolvedMax ?? DEFAULT_MAX_MULLIGANS;
}