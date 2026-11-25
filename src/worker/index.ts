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

	const {
		imageUrl: _imageUrl,
		quantity: _quantity,
		set: _set,
		number: _number,
		...rest
	} = merged;

	const cleaned: Record<string, any> = {};
	for (const [key, value] of Object.entries(rest)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		cleaned[key] = value;
	}

	if (cleaned.count === undefined && card.quantity !== undefined) {
		cleaned.count = card.quantity;
	}
	if (!cleaned.text && cached?.text) cleaned.text = cached.text;
	if (!cleaned.back_text && cached?.back_text) cleaned.back_text = cached.back_text;

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

function buildMetaSnapshot(metaDecks: Record<string, any>): string {
	const entries = Object.values(metaDecks || {});
	if (entries.length === 0) return "None";
	return entries
		.map((md: any) => {
			const name = md?.metadata?.name || "Meta Deck";
			const leader = md?.leader?.name || md?.leader?.id || "Unknown Leader";
			const base = md?.base?.name || md?.base?.id || "Unknown Base";
			const leaderAbility = md?.leader?.text ? ` — Ability: ${md.leader.text}` : "";
			return `- ${name}: Leader ${leader}${leaderAbility} | Base ${base}`;
		})
		.join("\n");
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

		const cacheMap = (cardCache ?? {}) as Record<string, any>;
		const sanitizedDeck = sanitizeDeckForPrompt(body.deck, cacheMap);
		const metaSnapshot = buildMetaSnapshot((metaDecksCache ?? {}) as Record<string, any>);

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
      "in": "Add +X <Exact Sideboard Card Name>, +Y <Exact Sideboard Card Name> (when/why: e.g. stabilizes ground early)"
    },
    {
      "matchup": "vs. Hard Control",
      "out": "Cut -X <Exact Card Name> (when/why)",
      "in": "Add +X <Exact Sideboard Card Name> (when/why)"
    },
    {
      "matchup": "vs. Midrange Mirror",
      "out": "Cut -X <Exact Card Name> (when/why)",
      "in": "Add +X <Exact Sideboard Card Name> (when/why)"
    }
  ],
  "suggestedChanges": [
    {
      "cut": "-X <Exact Card Name from main deck>",
      "add": "+X <Recommended Card Name or role/cost profile>",
      "reason": "Concrete reason referencing curve, meta matchups, or Leader/card-text synergy"
    }
  ]
}

Coaching Rules:
- Read \`leader.text\`, \`leader.back_text\`, \`base.text\`, and each card's \`text\`, \`traits\`, and \`aspects\` in the Deck JSON to identify concrete synergies (e.g. cost triggers, trait payoffs, exhaust/attack triggers).
- In \`sideboardPlan\`, ALWAYS name exact cards and quantities from \`main\` (to cut) and \`side\` (to bring in) along with when/why to swap them. If \`side\` is empty, recommend specific sideboard cards to add.
- In \`suggestedChanges\`, provide 2-3 actionable main-deck improvements (cuts/adds or ratio tweaks) to sharpen Leader synergy or shore up weak meta matchups.
- Never suggest stopping resourcing earlier than the resources needed to deploy the Leader.
- Factor in how this deck competes against the current tournament meta below.

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
