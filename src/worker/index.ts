import { Hono } from "hono";
import { callGeminiWithTrace, generateHexId } from "../gemini"
import { Deck } from "../lib/decks"

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(slug: string): boolean {
	return slug.length > 0 && slug.length <= 160 && SLUG_RE.test(slug);
}

interface WorkerEnv extends Env {
	GEMINI_API_KEY?: string;
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
import metaDecksCache from '../data/meta-decks.json';

// Helper to format Deck into readable lines for the LLM prompt
function formatDeckSummary(deck?: Deck): string {
	if (!deck) return "N/A";
	const lines: string[] = [];

	if (deck.leader?.name || deck.leader?.id) {
		lines.push(`Leader: ${deck.leader.name || "Unknown"} (${deck.leader.id || "N/A"})`);
	}
	if (deck.base?.name || deck.base?.id) {
		lines.push(`Base: ${deck.base.name || "Unknown"} (${deck.base.id || "N/A"})`);
	}
	if (Array.isArray(deck.main) && deck.main.length > 0) {
		lines.push("Main Deck:");
		for (const card of deck.main) {
			const qty = card.count ?? card.quantity ?? 1;
			lines.push(`- ${qty}x ${card.name || card.id || "Unknown"} (${card.id || "N/A"})`);
		}
	}
	if (Array.isArray(deck.side) && deck.side.length > 0) {
		lines.push("Sideboard:");
		for (const card of deck.side) {
			const qty = card.count ?? card.quantity ?? 1;
			lines.push(`- ${qty}x ${card.name || card.id || "Unknown"} (${card.id || "N/A"})`);
		}
	}

	return lines.length > 0 ? lines.join("\n") : "N/A";
}

function extractRelevantCardPool(
	cache: Record<string, any> | undefined,
	deck: Deck | undefined,
	metaDecks: Record<string, any> | undefined,
): Record<string, any> {
	if (!cache || typeof cache !== "object") return {};

	const ids = new Set<string>();
	const addId = (rawId?: string) => {
		if (!rawId) return;
		const clean = String(rawId).trim().toUpperCase();
		ids.add(clean);
		const m = clean.match(/^([A-Z0-9]+)_0*(\d+)$/);
		if (m) {
			ids.add(`${m[1]}_${m[2].padStart(3, "0")}`);
			ids.add(`${m[1]}_${m[2]}`);
		}
	};

	if (deck) {
		addId(deck.leader?.id);
		addId(deck.base?.id);
		for (const card of deck.main || []) addId(card.id);
		for (const card of deck.side || []) addId(card.id);
	}

	if (metaDecks && typeof metaDecks === "object") {
		for (const metaKey of Object.keys(metaDecks)) {
			const md = metaDecks[metaKey];
			addId(md?.leader?.id);
			addId(md?.base?.id);
			for (const item of md?.deck || []) addId(item.id);
			for (const item of md?.sideboard || []) addId(item.id);
		}
	}

	const pool: Record<string, any> = {};
	for (const [key, value] of Object.entries(cache)) {
		if (ids.has(key.toUpperCase())) {
			pool[key] = value;
		}
	}
	return Object.keys(pool).length > 0 ? pool : cache;
}

function sanitizeCardForPrompt(card: any): Record<string, any> {
	if (!card || typeof card !== "object") return {};

	const {
		imageUrl: _imageUrl,
		quantity: _quantity,
		set: _set,
		number: _number,
		...rest
	} = card;

	const cleaned: Record<string, any> = {};
	for (const [key, value] of Object.entries(rest)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		cleaned[key] = value;
	}

	if (cleaned.count === undefined && card.quantity !== undefined) {
		cleaned.count = card.quantity;
	}

	return cleaned;
}

function sanitizeDeckForPrompt(deck?: Deck): Record<string, any> | null {
	if (!deck) return null;

	return {
		...(deck.leader ? { leader: sanitizeCardForPrompt(deck.leader) } : {}),
		...(deck.base ? { base: sanitizeCardForPrompt(deck.base) } : {}),
		...(Array.isArray(deck.main)
			? { main: deck.main.map(sanitizeCardForPrompt) }
			: {}),
		...(Array.isArray(deck.side)
			? { side: deck.side.map(sanitizeCardForPrompt) }
			: {}),
	};
}

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
		}>();

		const compactMetaDecks = JSON.stringify(metaDecksCache ?? {}, null, 2).slice(0, 8000);
		const compactCardCache = JSON.stringify(cardCache ?? {}).slice(0, 12000);

		const sanitizedDeck = sanitizeDeckForPrompt(body.deck);
		const relevantCardPool = extractRelevantCardPool(
			cardCache as Record<string, any>,
			body.deck,
			metaDecksCache as Record<string, any>,
		);

		// - Card Pool Reference (JSON)
// ${JSON.stringify(relevantCardPool, null, 2)}

// Current Meta Decks (JSON)
// ${JSON.stringify(metaDecksCache ?? {}, null, 2)}

		const prompt = `You are an elite competitive Star Wars: Unlimited TCG strategic coach.
Analyze this deck setup:


Provide strategic guidance. Return ONLY a single JSON object (no markdown, no backticks) with this structure:
{
  "summary": "2-3 sentence executive strategic assessment of this specific deck and leader synergy",
  "mulligan": [
    "Priority 1: ...",
    "Priority 2: ...",
    "Redraw Rule: ..."
  ],
  "tactics": [
    "Leader deployment timing & swing turn ...",
    "Ground vs Space lane prioritization ...",
    "Resource curve management ..."
  ],
  "sideboardPlan": [
    { "matchup": "vs. Hyper Aggro", "out": "Cut slow 5+ cost units", "in": "Add cheap sentinels / base healing" },
    { "matchup": "vs. Hard Control", "out": "Cut low-threat ground units", "in": "Add disruption / hand control / fast space" },
    { "matchup": "vs. Midrange Mirror", "out": "Cut narrow situational cards", "in": "Add targeted removal / tempo tools" }
  ]
}

Consider the current meta and how this deck may need to compete against those deck's
Don't suggest to stop resourcing earlier than resources needed for leader deploy.
When analysing the deck look up the card id XXX_123 using the card pool reference to understand the card.

Deck to Analyse
- Leader: ${body.leader || "Unknown"}
- Base: ${body.base || "Unknown"}
- Aspects: ${(body.aspects || []).join(", ") || "None"}
- Inferred Archetype: ${body.archetype || "Unknown"}
- Total Cards: ${body.totalCards || 50}
- Average Unit Cost: ${body.avgUnitCost || "N/A"}
- Arena Breakdown: ${body.groundRatio || 0}% Ground vs ${body.spaceRatio || 0}% Space
- Resource Curve: ${JSON.stringify(body.curve || {})}
- Full Deck JSON:
${sanitizedDeck ? JSON.stringify(sanitizedDeck, null, 2) : "N/A"}
`;

		const traceId = generateHexId(16);
		let rawContent = "";
		let lastErrorText = "";

		// 1. Primary call: Interactions API
		const primary = await callGeminiWithTrace({
			c,
			traceId,
			name: "coach-interactions",
			model: "gemini-3.8-flash",
			prompt,
			apiKey,
			mode: "interactions",
			timeoutMs: 10000,
		});

		rawContent = primary.text;
		lastErrorText = primary.errorText;

		// 2. Fallback calls: generateContent across candidate models
		if (!rawContent) {
			const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
			for (const model of candidateModels) {
				const fallback = await callGeminiWithTrace({
					c,
					traceId,
					name: `coach-generate-${model}`,
					model,
					prompt,
					apiKey,
					mode: "generateContent",
					timeoutMs: 8000,
				});

				if (fallback.text) {
					rawContent = fallback.text;
					break;
				}
				lastErrorText = fallback.errorText;
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
