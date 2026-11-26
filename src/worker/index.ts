import { Hono } from "hono";
import { callGeminiWithTrace, generateHexId } from "../gemini"
import { Deck } from "../lib/decks"

import { PREMIER_BAN_LIST, SET_CONFIG } from "../react-app/lib/consts"; // adjust path to match your repo

function getPremierLegalityRules(nowMs = Date.now()): {
	legalSets: string[];
	bannedOrSuspendedNames: string[];
} {
	const legalSets = Object.entries(SET_CONFIG)
		.filter(([, cfg]) => {
			if (!cfg.dateRotatedOut) return true;
			const rotMs = Date.parse(cfg.dateRotatedOut);
			return Number.isFinite(rotMs) && rotMs > nowMs;
		})
		.map(([code, cfg]) => `${code} (${cfg.label})`);

	const bannedOrSuspendedNames = Object.values(PREMIER_BAN_LIST)
		.filter((entry) => !entry.unban_date)
		.map((entry) => entry.card_name);

	return { legalSets, bannedOrSuspendedNames };
}

const { legalSets, bannedOrSuspendedNames } = getPremierLegalityRules();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(slug: string): boolean {
	return slug.length > 0 && slug.length <= 160 && SLUG_RE.test(slug);
}

interface WorkerEnv extends Env {
	GEMINI_API_KEY?: string;
	ENABLE_GEMINI_INTERACTIONS?: string;
}

const app = new Hono<{ Bindings: WorkerEnv }>();

app.get("/api/metrics/:slug", async (c) => {
	const slug = c.req.param("slug");
	if (!isValidSlug(slug)) {
		return c.json({ error: "Invalid slug" }, 400);
	}
	const row = await c.env.DB.prepare(
		"SELECT likes, views FROM post_metrics WHERE slug = ?",
	)
		.bind(slug)
		.first<{ likes: number; views: number }>();
	return c.json({
		likes: row?.likes ?? 0,
		views: row?.views ?? 0,
	});
});

app.post("/api/metrics/:slug/like", async (c) => {
	const slug = c.req.param("slug");
	if (!isValidSlug(slug)) {
		return c.json({ error: "Invalid slug" }, 400);
	}
	await c.env.DB.prepare(
		`INSERT INTO post_metrics (slug, likes, views, updated_at)
		 VALUES (?, 1, 0, unixepoch())
		 ON CONFLICT(slug) DO UPDATE SET
		   likes = likes + 1,
		   updated_at = unixepoch()`,
	)
		.bind(slug)
		.run();
	const row = await c.env.DB.prepare(
		"SELECT likes, views FROM post_metrics WHERE slug = ?",
	)
		.bind(slug)
		.first<{ likes: number; views: number }>();
	return c.json({
		likes: row?.likes ?? 0,
		views: row?.views ?? 0,
	});
});

app.post("/api/metrics/:slug/view", async (c) => {
	const slug = c.req.param("slug");
	if (!isValidSlug(slug)) {
		return c.json({ error: "Invalid slug" }, 400);
	}
	await c.env.DB.prepare(
		`INSERT INTO post_metrics (slug, likes, views, updated_at)
		 VALUES (?, 0, 1, unixepoch())
		 ON CONFLICT(slug) DO UPDATE SET
		   views = views + 1,
		   updated_at = unixepoch()`,
	)
		.bind(slug)
		.run();
	const row = await c.env.DB.prepare(
		"SELECT likes, views FROM post_metrics WHERE slug = ?",
	)
		.bind(slug)
		.first<{ likes: number; views: number }>();
	return c.json({
		likes: row?.likes ?? 0,
		views: row?.views ?? 0,
	});
});

app.get("/api/debug/stats", async (c) => {
	const res = await c.env.DB.prepare(
		"SELECT slug, likes, views, updated_at FROM post_metrics ORDER BY slug ASC",
	).all<{ slug: string; likes: number; views: number; updated_at: number }>();
	return c.json({ rows: res.results ?? [] });
});

// ── SWUDB Deck Import Proxy ─────────────────────────────────────────
app.get("/api/swudb/:deckId", async (c) => {
	const deckId = c.req.param("deckId");

	// SWUDB deck IDs can be alphanumeric codes or numbers (e.g. "ABCD1234")
	if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(deckId)) {
		return c.json({ error: "Invalid deck ID format" }, 400);
	}

	try {
		const upstream = await fetch(
			`https://swudb.com/api/getDeckJson/${deckId}`,
			{
				headers: {
					"User-Agent": "MurderOfPorgs-DeckGrader/1.0",
					Accept: "application/json",
				},
			},
		);

		if (!upstream.ok) {
			return c.json(
				{ error: `SWUDB responded with status ${upstream.status}` },
				upstream.status === 404 ? 404 : 502,
			);
		}

		const data = await upstream.json();
		return c.json(data);
	} catch (err: any) {
		return c.json({ error: "Failed to connect to SWUDB", details: err?.message }, 502);
	}
});

import cardCache from '../data/card-cache.json';
import metaDecksCache from '../data/meta-decks-v2.json';

function findCachedCard(
	cache: Record<string, any>,
	rawId?: string,
): Record<string, any> | undefined {
	if (!rawId) return undefined;
	const clean = String(rawId).trim().toUpperCase();
	if (cache[clean]) return cache[clean];
	const m = clean.match(/^([A-Z0-9]+)_0*(\d+)$/);
	if (m) {
		return cache[`${m[1]}_${m[2].padStart(3, "0")}`] ?? cache[`${m[1]}_${m[2]}`];
	}
	return undefined;
}

function sanitizeCardForPrompt(
	card: any,
	cache: Record<string, any>,
): Record<string, any> {
	if (!card || typeof card !== "object") return {};

	const cached = findCachedCard(cache, card.id);
	const merged = cached ? { ...cached, ...card } : card;

	const cleaned: Record<string, any> = {};
	const count = merged.count ?? card.quantity ?? 1;
	cleaned.count = count;

	if (merged.name) cleaned.name = merged.name;
	if (merged.cost !== undefined && merged.cost !== null) cleaned.cost = merged.cost;
	if (Array.isArray(merged.aspects) && merged.aspects.length > 0) cleaned.aspects = merged.aspects;
	if (Array.isArray(merged.traits) && merged.traits.length > 0) cleaned.traits = merged.traits;
	if (merged.text) cleaned.text = merged.text;
	if (merged.back_text) cleaned.back_text = merged.back_text;

	return cleaned;
}

function sanitizeDeckForPrompt(
	deck: Deck | undefined,
	cache: Record<string, any>,
): Record<string, any> | null {
	if (!deck) return null;

	return {
		...(deck.leader ? { leader: sanitizeCardForPrompt(deck.leader, cache) } : {}),
		...(deck.base ? { base: sanitizeCardForPrompt(deck.base, cache) } : {}),
		...(Array.isArray(deck.main)
			? { main: deck.main.map((c) => sanitizeCardForPrompt(c, cache)) }
			: {}),
		...(Array.isArray(deck.side)
			? { side: deck.side.map((c) => sanitizeCardForPrompt(c, cache)) }
			: {}),
	};
}

function formatCompactCardList(cards: any[]): string {
	if (!Array.isArray(cards) || cards.length === 0) return "None";
	return cards
		.map((c: any) => {
			const qty = c?.count ?? c?.quantity ?? 1;
			const name = c?.name || c?.id || "Unknown";
			const cost = c?.cost !== undefined ? ` (${c.cost}c)` : "";
			return `${qty}x ${name}${cost}`;
		})
		.join(", ");
}

function buildMetaSnapshot(metaDecks: Record<string, any>, maxDecks = 5): string {
	const entries = Object.values(metaDecks || {}).slice(0, maxDecks);
	if (entries.length === 0) return "None";
	return entries
		.map((md: any) => {
			const name = md?.metadata?.name || "Meta Deck";
			const leader = md?.leader?.name || md?.leader?.id || "Unknown Leader";
			const base = md?.base?.name || md?.base?.id || "Unknown Base";
			const mainList = formatCompactCardList(md?.deck || md?.main || []);
			return `- ${name}: ${leader} | ${base}\n  Main: ${mainList}`;
		})
		.join("\n");
}

function getPremierLegalCardNames(
	cache: Record<string, any>,
	aspects: string[] = [],
	limit = 45,
): string[] {
	const { legalSets, bannedOrSuspendedNames } = getPremierLegalityRules();
	const legalSetCodes = new Set(
		legalSets.map((entry) => entry.split(" ")[0].toUpperCase()),
	);
	const blockedNames = new Set(
		bannedOrSuspendedNames.map((n) => n.toLowerCase()),
	);
	const allowedAspects = new Set(aspects.map((a) => a.toLowerCase()));

	const names: string[] = [];
	const seen = new Set<string>();

	for (const [key, card] of Object.entries(cache || {})) {
		if (!card || typeof card !== "object" || !card.name) continue;
		const idUpper = String(card.id || key).toUpperCase();
		const setCode = String(card.set || idUpper.split("_")[0] || "").toUpperCase();
		if (setCode && legalSetCodes.size > 0 && !legalSetCodes.has(setCode)) continue;

		const nameStr = String(card.name).trim();
		const lowerName = nameStr.toLowerCase();
		if (!nameStr || seen.has(lowerName) || blockedNames.has(lowerName)) continue;

		if (allowedAspects.size > 0 && Array.isArray(card.aspects) && card.aspects.length > 0) {
			const cardAspects = card.aspects.map((a: unknown) => String(a).toLowerCase());
			const matchesAspect = cardAspects.some((a: string) => allowedAspects.has(a));
			if (!matchesAspect) continue;
		}

		seen.add(lowerName);
		names.push(nameStr);
		if (names.length >= limit) break;
	}

	return names;
}

type ModelCandidate = {
	model: string;
	mode: "interactions" | "generateContent";
	timeoutMs: number;
};

const ALL_CANDIDATE_MODELS: ModelCandidate[] = [
	{ model: "gemini-3.8-flash", mode: "interactions", timeoutMs: 12000 },
	{ model: "gemini-3.1-flash-lite", mode: "generateContent", timeoutMs: 10000 },
	{ model: "gemini-3.5-flash", mode: "generateContent", timeoutMs: 12000 },
	{ model: "gemini-3.8-flash", mode: "generateContent", timeoutMs: 12000 },
];

function getCandidateModels(env: WorkerEnv, forceInteractions = false): ModelCandidate[] {
	const allowInteractions =
		forceInteractions || env.ENABLE_GEMINI_INTERACTIONS?.toLowerCase() === "true";
	return ALL_CANDIDATE_MODELS.filter((m) => allowInteractions || m.mode !== "interactions");
}

function isRetryableGeminiError(errText: string): boolean {
	return /\b(408|429|500|502|503|504)\b|timeout|aborted|service_unavailable|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(
		errText,
	);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── AI Coach Endpoint ───────────────────────────────────────────────
app.post("/api/coach", async (c) => {
	const apiKey = c.env.GEMINI_API_KEY;
	if (!apiKey) {
		return c.json(
			{
				success: false,
				configured: false,
				error: "GEMINI_API_KEY is not configured in Worker environment.",
			},
			200,
		);
	}

	try {
		const body = await c.req.json<{
			archetype?: string;
			leader?: string;
			base?: string;
			aspects?: string[];
			totalCards?: number;
			avgUnitCost?: string;
			groundRatio?: number;
			spaceRatio?: number;
			deck: Deck;
			curve?: Record<string, number>;
			testInteractions?: boolean;
		}>();

		if (!body?.deck || typeof body.deck !== "object") {
			return c.json({ success: false, configured: true, error: "Missing deck payload." }, 400);
		}

		const cacheMap = (cardCache ?? {}) as Record<string, any>;
		const sanitizedDeck = sanitizeDeckForPrompt(body.deck, cacheMap);
		const metaSnapshot = buildMetaSnapshot((metaDecksCache ?? {}) as Record<string, any>);
		const premierCardPool = getPremierLegalCardNames(cacheMap, body.aspects || []);


		const prompt = `You are an elite competitive Star Wars: Unlimited TCG strategic coach.
Analyze this decklist, including the card text, traits, aspects, and cost of the Leader (both front \`text\` and deployed \`back_text\`), Base, Main Deck, and Sideboard.

Return ONLY a single valid JSON object (no markdown, no backticks) with this exact structure:
{
  "summary": "2-3 sentence executive strategic assessment explaining how the Leader's front/back abilities and Base synergize with key cards and traits in the main deck.",
  "mulligan": [
    "Priority 1: Name specific early-game cards to keep and why...",
    "Priority 2: Name synergy/curve pieces to look for...",
    "Redraw Rule: Name specific cards or cost ranges to pitch..."
  ],
  "tactics": [
    "Leader Synergy & Deployment: Explain how Leader front/back text interacts with specific cards in the deck and the optimal resource turn to deploy...",
    "Ground vs Space Lane Plan: Explain how specific units/events control lanes...",
    "Resource Curve Management: ..."
  ],
  "sideboardPlan": [
    {
      "matchup": "vs. Hyper Aggro",
      "out": "Cut -X <Exact Card Name>, -Y <Exact Card Name> (when/why: e.g. too slow before turn 4)",
      "in": "Add +X <Exact Card Name>, +Y <Exact Card Name> (when/why: e.g. stabilizes ground early)"
    },
    {
      "matchup": "vs. Hard Control",
      "out": "Cut -X <Exact Card Name> (when/why)",
      "in": "Add +X <Exact Card Name> (when/why)"
    },
    {
      "matchup": "vs. Midrange Mirror",
      "out": "Cut -X <Exact Card Name> (when/why)",
      "in": "Add +X <Exact Card Name> (when/why)"
    }
  ],
  "suggestedChanges": [
    {
      "cut": "-X <Exact Card Name from main deck>",
      "add": "+X <Exact Premier-Legal Card Name>",
      "reason": "Concrete reason referencing curve, meta matchups, or Leader/card-text synergy"
    }
  ]
}

Coaching Rules:
- Read \`leader.text\`, \`leader.back_text\`, \`base.text\`, and each card's \`text\`, \`traits\`, and \`aspects\` in the Deck JSON to identify concrete synergies (e.g. cost triggers, trait payoffs, exhaust/attack triggers).
- ASPECT PENALTY RULES: Cards with aspects outside the deck's leader/base aspects are still legal and playable, but cost 2 extra resources per unmatched aspect icon. Never call an off-aspect card "unplayable" or "illegal"—evaluate it on whether paying the extra aspect cost is worth its effect or synergy.
- PREMIER LEGALITY: Only recommend cards from Premier-legal sets (${legalSets.join(", ")}). NEVER recommend cards from rotated sets (SOR, SHD, TWI) such as Resupply, or banned/suspended Premier cards (${bannedOrSuspendedNames.join(", ")}).
- EXACT CARD NAMES ONLY: In \`sideboardPlan\` (\`out\` and \`in\`) and \`suggestedChanges\` (\`cut\` and \`add\`), ALWAYS name exact Premier-legal cards and quantities (e.g., "Add +2 <Exact Card Name> (...)"). When \`side\` is empty, still recommend specific Premier-legal cards by exact name—never use vague categories like "removal", "threats", "disruption", or "utility units".
- EMPTY SIDEBOARD HANDLING: If \`side\` is empty or lacks a card for a matchup, explicitly recommend specific Premier-legal sideboard cards to add (with exact names and counts) rather than listing cards from \`main\` as if they were already in \`side\`.
- In \`suggestedChanges\`, provide 2-3 actionable main-deck improvements (cuts/adds or ratio tweaks) to sharpen Leader synergy or shore up weak meta matchups.
- Never suggest stopping resourcing earlier than the resources needed to deploy the Leader.
- Factor in how this deck competes against the current tournament meta below.

Premier-Legal Card Pool (choose exact names from here when recommending cards):
${premierCardPool.join(", ")}

Current Tournament Meta:
${metaSnapshot}

Deck to Analyse:
- Leader: ${body.leader || "Unknown"}
- Base: ${body.base || "Unknown"}
- Aspects: ${(body.aspects || []).join(", ") || "None"}
- Inferred Archetype: ${body.archetype || "Unknown"}
- Total Cards: ${body.totalCards || 50}
- Average Unit Cost: ${body.avgUnitCost || "N/A"}
- Arena Breakdown: ${body.groundRatio || 0}% Ground vs ${body.spaceRatio || 0}% Space
- Resource Curve: ${JSON.stringify(body.curve || {})}
- Full Deck JSON (with card text):
${sanitizedDeck ? JSON.stringify(sanitizedDeck) : "N/A"}
`;
		const traceId = generateHexId(16);
		let rawContent = "";
		let lastErrorText = "";

		const forceInteractions =
			c.req.query("interactions") === "1" || body.testInteractions === true;
		const candidateModels = getCandidateModels(c.env, forceInteractions);

		const MAX_TOTAL_MS = 25000;
		const startedAt = Date.now();

		for (let i = 0; i < candidateModels.length; i++) {
			if (i > 0) {
				if (Date.now() - startedAt >= MAX_TOTAL_MS) {
					lastErrorText = lastErrorText || "Exceeded total coaching time budget";
					break;
				}
				await sleep(350 + Math.floor(Math.random() * 250));
			}

			if (Date.now() - startedAt >= MAX_TOTAL_MS) {
				lastErrorText = lastErrorText || "Exceeded total coaching time budget";
				break;
			}

			const step = candidateModels[i];
			if (i > 0) {
				await sleep(350 + Math.floor(Math.random() * 250));
			}

			const res = await callGeminiWithTrace({
				c,
				traceId,
				name: `coach-${step.model}`,
				model: step.model,
				prompt,
				apiKey,
				mode: step.mode,
				timeoutMs: step.timeoutMs,
			});

			if (res.text) {
				rawContent = res.text;
				break;
			}

			lastErrorText = res.errorText || "Unknown Gemini error";
			if (!isRetryableGeminiError(lastErrorText)) {
				break;
			}
		}

		if (!rawContent) {
			return c.json(
				{ success: false, configured: true, error: `Gemini API error: ${lastErrorText}` },
				502,
			);
		}

		let parsed: any;
		try {
			const clean = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
			parsed = JSON.parse(clean);
		} catch {
			parsed = {
				summary: rawContent,
				mulligan: ["Review opening hand for turn 1-2 plays."],
				tactics: ["Deploy leader on-curve for maximum tempo."],
				sideboardPlan: [],
				suggestedChanges: [],
			};
		}

		return c.json({
			success: true,
			configured: true,
			source: "gemini",
			analysis: parsed,
		});
	} catch (e: any) {
		return c.json(
			{ success: false, configured: true, error: e?.message || "Internal error generating coaching" },
			500,
		);
	}
});

app.all("*", async (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
