import { describe, expect, it } from "vitest";
import {
  CardType,
  type CardCache,
  parseSWUDBCard,
  parseSWUDBDeck,
} from "./Decks";

const sampleCache: CardCache = {
  ASH_011: {
    name: "Cad Bane",
    subtitle: "He Who Needs No Introduction",
    cost: 5,
    type: "LEADER",
    arenas: ["Ground"],
    traits: ["Underworld"],
    hp: 6,
    power: 3,
    set: "ASH",
    number: "011",
    imageUrl: "https://example.com/ash_011.png",
    aspects: ["Cunning", "Villainy"],
    text: "Action: Exhaust Cad Bane...",
    unique: true,
  },
  JTL_030: {
    name: "Mos Eisley",
    subtitle: "Spaceport",
    cost: 0,
    type: "BASE",
    arenas: ["None"],
    traits: ["Location"],
    hp: 28,
    set: "JTL",
    number: "030",
    imageUrl: null,
    aspects: ["Cunning"],
    unique: false,
  },
  LAW_174: {
    name: "0-0-0",
    subtitle: "Protocol Droid of Torment",
    cost: 2,
    type: "UNIT",
    arenas: ["Ground"],
    traits: ["Droid"],
    hp: 2,
    power: 2,
    set: "LAW",
    number: "174",
    imageUrl: "https://example.com/law_174.png",
    aspects: ["Villainy"],
    unique: true,
  },
  SEC_042: {
    name: "Planetary Bombardment",
    cost: 7,
    type: "EVENT",
    arenas: ["None"],
    traits: ["Tactic"],
    set: "SEC",
    number: "042",
    imageUrl: "https://example.com/sec_042.png",
    aspects: ["Aggression", "Villainy"],
    unique: false,
  },
};

describe("parseSWUDBCard", () => {
  it("normalizes raw card fields and maps string card types", () => {
    const card = parseSWUDBCard({
      id: "LAW_174",
      name: "0-0-0",
      subtitle: "Protocol Droid of Torment",
      count: 3,
      cost: 2,
      type: "UNIT",
      arenas: ["Ground"],
      traits: ["Droid"],
      hp: 2,
      power: 2,
      set: "LAW",
      number: "174",
      imageUrl: "https://example.com/law_174.png",
      aspects: ["Villainy"],
      unique: true,
    });

    expect(card).toEqual({
      id: "LAW_174",
      name: "0-0-0",
      subtitle: "Protocol Droid of Torment",
      count: 3,
      cost: 2,
      type: CardType.UNIT,
      arena: "Ground",
      traits: ["Droid"],
      hp: 2,
      power: 2,
      set: "LAW",
      number: "174",
      imageUrl: "https://example.com/law_174.png",
      aspects: ["Villainy"],
      text: undefined,
      unique: true,
    });
  });

  it("applies safe defaults when optional fields are missing", () => {
    const card = parseSWUDBCard({ id: "MIN_001", name: "Mystery Card" });

    expect(card.count).toBe(1);
    expect(card.cost).toBe(0);
    expect(card.type).toBe(CardType.UNIT);
    expect(card.arena).toBe("None");
    expect(card.traits).toEqual([]);
    expect(card.aspects).toEqual([]);
    expect(card.imageUrl).toBeNull();
    expect(card.unique).toBe(false);
  });
});

describe("parseSWUDBDeck", () => {
  it("hydrates leader, base, main, and side cards from cache while preserving counts", () => {
    const rawDeck = {
      leader: { id: "ASH_011", count: 1 },
      base: { id: "JTL_030", count: 1 },
      deck: [{ id: "LAW_174", count: 3 }],
      sideboard: [{ id: "SEC_042", count: 2 }],
    };

    const parsed = parseSWUDBDeck(rawDeck, sampleCache);

    expect(parsed.leader.id).toBe("ASH_011");
    expect(parsed.leader.name).toBe("Cad Bane");
    expect(parsed.leader.type).toBe(CardType.LEADER);
    expect(parsed.leader.count).toBe(1);

    expect(parsed.base.id).toBe("JTL_030");
    expect(parsed.base.name).toBe("Mos Eisley");
    expect(parsed.base.type).toBe(CardType.BASE);

    expect(parsed.main).toHaveLength(1);
    expect(parsed.main[0]).toMatchObject({
      id: "LAW_174",
      name: "0-0-0",
      count: 3,
      quantity: 3,
    });

    expect(parsed.side).toHaveLength(1);
    expect(parsed.side[0]).toMatchObject({
      id: "SEC_042",
      name: "Planetary Bombardment",
      count: 2,
      quantity: 2,
      type: CardType.EVENT,
    });
  });

  it("supports 'main' and 'side' array keys as well as 'deck' and 'sideboard'", () => {
    const parsed = parseSWUDBDeck(
      {
        leader: { id: "ASH_011", count: 1 },
        base: { id: "JTL_030", count: 1 },
        main: [{ id: "LAW_174", count: 2 }],
        side: [{ id: "SEC_042", count: 1 }],
      },
      sampleCache
    );

    expect(parsed.main[0]).toMatchObject({ id: "LAW_174", count: 2, quantity: 2 });
    expect(parsed.side[0]).toMatchObject({ id: "SEC_042", count: 1, quantity: 1 });
  });

  it("falls back cleanly when a card ID is missing from the cache or cache is empty", () => {
    const parsed = parseSWUDBDeck(
      {
        leader: { id: "UNKNOWN_LEADER", count: 1 },
        base: { id: "UNKNOWN_BASE", count: 1 },
        deck: [{ id: "MISSING_999", count: 3 }],
      },
      {}
    );

    expect(parsed.main[0]).toMatchObject({
      id: "MISSING_999",
      name: "",
      count: 3,
      quantity: 3,
    });
  });
});