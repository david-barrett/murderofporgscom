import { describe, expect, it } from "vitest";
import { CardType, type CardCache, type DeckCard } from "./decks";
import {
  analyzeDeck,
  buildHeuristicAnalysis,
  buildSideboardPlan,
  classifyArchetype,
  computeMetaTargetCurves,
  extractSwudbDeckId,
  findCardData,
  parseDeckListText,
} from "./deckGrader";

const sampleCache: CardCache = {
  HMW_014: {
    name: "Wicket",
    subtitle: "Few Greater Battles to Fight",
    cost: 4,
    type: "Leader",
    arena: "Ground",
    traits: ["EWOK"],
    hp: 5,
    power: 2,
    set: "HMW",
    number: "014",
    aspects: ["Aggression", "Heroism"],
    unique: true,
  },
  LAW_174: {
    name: "0-0-0",
    cost: 2,
    type: "Unit",
    arena: "Ground",
    traits: ["DROID"],
    set: "LAW",
    number: "174",
    aspects: ["Villainy"],
    unique: true,
  },
  JTL_140: {
    name: "Tie Advanced",
    cost: 2,
    type: "Unit",
    arena: "Space",
    traits: ["VEHICLE"],
    set: "JTL",
    number: "140",
    aspects: ["Cunning"],
    unique: false,
  },
  SEC_042: {
    name: "Planetary Bombardment",
    cost: 6,
    type: "Event",
    arena: "None",
    traits: ["TACTIC"],
    set: "SEC",
    number: "042",
    aspects: ["Aggression"],
    unique: false,
  },
};

function makeDeckCard(overrides: Partial<DeckCard>): DeckCard {
  return {
    id: "TEST_001",
    name: "Test Card",
    count: 3,
    quantity: 3,
    cost: 2,
    type: CardType.UNIT,
    arena: "Ground",
    traits: [],
    set: "TEST",
    number: "001",
    imageUrl: null,
    aspects: ["Cunning"],
    unique: false,
    ...overrides,
  };
}

describe("findCardData", () => {
  it("finds cards by exact ID, unpadded ID, and card name", () => {
    expect(findCardData("HMW_014", sampleCache)?.name).toBe("Wicket");
    expect(findCardData("hmw_14", sampleCache)?.name).toBe("Wicket");
    expect(findCardData("0-0-0", sampleCache)?.number).toBe("174");
    expect(findCardData("NONEXISTENT", sampleCache)).toBeNull();
  });
});

describe("classifyArchetype", () => {
  it("classifies aggro, control, space swarm, and midrange decks", () => {
    expect(
      classifyArchetype({ "1": 10, "2": 10, "3": 4, "4": 2, "5": 0, "6+": 0 }, 24, 48, 4)
    ).toBe("Aggro Rush");

    expect(
      classifyArchetype({ "1": 2, "2": 6, "3": 6, "4": 6, "5": 6, "6+": 8 }, 20, 80, 4)
    ).toBe("Hard Control Ramp");

    expect(
      classifyArchetype({ "1": 4, "2": 8, "3": 8, "4": 4, "5": 2, "6+": 2 }, 20, 58, 12)
    ).toBe("Space Swarm Tempo");

    expect(
      classifyArchetype({ "1": 4, "2": 10, "3": 10, "4": 8, "5": 4, "6+": 4 }, 28, 84, 8)
    ).toBe("Midrange Tempo");
  });
});

describe("extractSwudbDeckId", () => {
  it("extracts deck IDs from SWUDB URLs and raw IDs", () => {
    expect(extractSwudbDeckId("https://swudb.com/deck/view/ABCD1234")).toBe("ABCD1234");
    expect(extractSwudbDeckId("https://swudb.com/deck/xyz_99")).toBe("xyz_99");
    expect(extractSwudbDeckId("  ABCD1234  ")).toBe("ABCD1234");
  });

  it("throws on invalid deck IDs", () => {
    expect(() => extractSwudbDeckId("not valid!!")).toThrow();
  });
});

describe("parseDeckListText", () => {
  it("parses decklist lines and hydrates card fields from cache", () => {
    const parsed = parseDeckListText(
      "3x 0-0-0 (LAW_174)\n2x Tie Advanced (JTL_140)",
      [],
      sampleCache
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: "LAW_174",
      name: "0-0-0",
      count: 3,
      quantity: 3,
      cost: 2,
      type: CardType.UNIT,
      arena: "Ground",
      imageUrl: "https://api.swu-db.com/cards/law/174?format=image",
    });
    expect(parsed[1]).toMatchObject({
      id: "JTL_140",
      arena: "Space",
      count: 2,
    });
  });
});

describe("computeMetaTargetCurves", () => {
  it("averages curves from cached meta decks by archetype", () => {
    const metaDecks = {
      meta_1: {
        leader: { id: "HMW_014", count: 1 },
        base: { id: "JTL_030", count: 1 },
        deck: [
          { id: "LAW_174", count: 10 },
          { id: "JTL_140", count: 10 },
        ],
      },
    };

    const buckets = computeMetaTargetCurves(metaDecks, sampleCache);
    expect(buckets["Aggro Rush"]).toBeDefined();
    expect(buckets["Aggro Rush"].sampleSize).toBe(1);
    expect(buckets["Aggro Rush"].curve["2"]).toBe(20);
  });
});

describe("analyzeDeck", () => {
  it("computes curve, arena split, out-of-aspect count, and S-grade for a balanced 50-card deck", () => {
    const main: DeckCard[] = [
      // 36 ground 2-drops (12 sets of 3) + 14 space 3-drops (4 sets of 3 + 1 set of 2) = 50 cards
      ...Array.from({ length: 12 }, (_, i) =>
        makeDeckCard({
          id: `GRD_${i + 1}`,
          name: `Ground Unit ${i + 1}`,
          count: 3,
          quantity: 3,
          cost: 2,
          arena: "Ground",
          aspects: ["Cunning"],
        })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeDeckCard({
          id: `SPC_${i + 1}`,
          name: `Space Unit ${i + 1}`,
          count: 3,
          quantity: 3,
          cost: 3,
          arena: "Space",
          aspects: ["Cunning"],
        })
      ),
      makeDeckCard({
        id: "SPC_5",
        name: "Space Unit 5",
        count: 2,
        quantity: 2,
        cost: 3,
        arena: "Space",
        aspects: ["Villainy"],
      }),
    ];

    const result = analyzeDeck(main, ["Cunning"], sampleCache, {});

    expect(result.totalCards).toBe(50);
    expect(result.totalUnits).toBe(50);
    expect(result.groundUnits).toBe(36);
    expect(result.spaceUnits).toBe(14);
    expect(result.groundRatio).toBe(72);
    expect(result.spaceRatio).toBe(28);
    expect(result.outOfAspect).toBe(2);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("S");
    expect(result.validForPremier).toBe(true);
    expect(result.validForEternal).toBe(true);
  });

  it("penalizes undersized decks and flags format invalidity", () => {
    const main = [makeDeckCard({ id: "LAW_174", count: 3, quantity: 3 })];
    const result = analyzeDeck(main, ["Villainy"], sampleCache, {});

    expect(result.totalCards).toBe(3);
    expect(result.validForPremier).toBe(false);
    expect(result.validForEternal).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.grade).toBe("F");
  });
});

describe("buildSideboardPlan & buildHeuristicAnalysis", () => {
  it("builds matchup swap plans and heuristic coaching output", () => {
    const main: DeckCard[] = [
      makeDeckCard({ id: "LOW_1", name: "Cheap Unit", cost: 1, count: 3, quantity: 3 }),
      makeDeckCard({ id: "BIG_1", name: "Capital Ship", cost: 6, count: 2, quantity: 2 }),
      makeDeckCard({ id: "UPG_1", name: "Lightsaber", cost: 2, type: CardType.UPGRADE, count: 1, quantity: 1 }),
    ];
    const side: DeckCard[] = [
      makeDeckCard({ id: "SB_1", name: "Sentinel Guard", cost: 2, count: 2, quantity: 2 }),
      makeDeckCard({ id: "SB_2", name: "Board Wipe", cost: 5, type: CardType.EVENT, count: 2, quantity: 2 }),
    ];

    const plan = buildSideboardPlan(main, side);
    expect(plan).toHaveLength(3);
    expect(plan[0].outCards.map((c) => c.name)).toContain("Capital Ship");
    expect(plan[0].inCards.map((c) => c.name)).toContain("Sentinel Guard");
    expect(plan[1].outCards.map((c) => c.name)).toContain("Cheap Unit");
    expect(plan[1].inCards.map((c) => c.name)).toContain("Board Wipe");

    const analysis = analyzeDeck(main, ["Cunning"], sampleCache, {});
    const heuristic = buildHeuristicAnalysis({
      analysis,
      leaderName: "Wicket",
      leaderSubtitle: "Few Greater Battles to Fight",
      baseName: "Data Vault",
      allAspects: ["Aggression", "Heroism"],
      sideboardPlan: plan,
    });

    expect(heuristic.summary).toContain("Wicket");
    expect(heuristic.mulligan).toHaveLength(3);
    expect(heuristic.tactics).toHaveLength(3);
    expect(heuristic.sideboardPlan).toHaveLength(3);
  });
});
