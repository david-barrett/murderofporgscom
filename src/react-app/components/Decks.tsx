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

export type CardCache = Record<string, RawCard>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawCard = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawDeck = Record<string, any>;

function mapCardType(rawType: unknown): CardType {
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
    hp: card.hp !== undefined ? Number(card.hp) : card.HP !== undefined ? Number(card.HP) : undefined,
    power: card.power !== undefined ? Number(card.power) : card.Power !== undefined ? Number(card.Power) : undefined,
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
  const backText = merged.back_text ?? merged.backText ?? merged.BackText ?? undefined;

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
    main: mainSource.map((entry: RawCard) => resolveDeckCardFromCache(entry, cache)),
    side: sideSource.map((entry: RawCard) => resolveDeckCardFromCache(entry, cache)),
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

function extractAndNormalizeId(imageUrl?: string | null, fallback = "UNKNOWN"): string {
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
  const allCards: RawCard[] = Array.isArray(metaDeck.cards) ? metaDeck.cards : [];

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

  const leaderSource = metaDeck.leaderCard ?? metaDeck.leader ?? leaderItem?.card ?? {};
  const baseSource = metaDeck.baseCard ?? metaDeck.base ?? baseItem?.card ?? {};

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
    deck: Array.isArray(metaDeck.deck) ? metaDeck.deck : mapSectionItems("MainDeck"),
    sideboard: Array.isArray(metaDeck.sideboard)
      ? metaDeck.sideboard
      : mapSectionItems("Sideboard"),
  };

  return parseSWUDBDeck(normalizedDeckInput, cache);
};