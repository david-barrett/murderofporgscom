import { Hono } from "hono";

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
			deckList?: string;
			curve?: Record<string, number>;
		}>();

		const prompt = `You are an elite competitive Star Wars: Unlimited TCG strategic coach.
Analyze this deck setup:
- Card Pool Reference
${cardCache}

Current Meta Decks
${metaDecksCache}

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
- Deck Sample:
${body.deckList ? body.deckList.slice(0, 1500) : "N/A"}
`
;

		// 1. Try Google's modern Interactions API (recommended by Google for AQ. keys & Gemini 3.8)
		let rawContent = "";
		let lastErrorText = "";

		try {
			const interactRes = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				signal: AbortSignal.timeout(100000),
				body: JSON.stringify({
					model: "gemini-3.8-flash",
					input: prompt,
				}),
			});

			if (interactRes.ok) {
				const interactData = (await interactRes.json()) as any;
				const step = interactData.steps?.find((s: any) => s.type === "model_output");
				const textPart = step?.content?.find((c: any) => c.type === "text" || typeof c.text === "string");
				if (textPart?.text) {
					rawContent = textPart.text;
				}
			} else {
				lastErrorText = await interactRes.text();
			}
		} catch (err: any) {
			lastErrorText = err?.message || "Interactions API timeout";
		}

		// 2. If Interactions API didn't return content, fallback to generateContent endpoint
		if (!rawContent) {
			const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
			for (const model of candidateModels) {
				const geminiUrl = apiKey.startsWith("AQ.")
					? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
					: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

				try {
					const res = await fetch(geminiUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-goog-api-key": apiKey,
						},
						signal: AbortSignal.timeout(80000),
						body: JSON.stringify({
							contents: [{ role: "user", parts: [{ text: prompt }] }],
							generationConfig: {
								temperature: 0.3,
								responseMimeType: "application/json",
							},
						}),
					});

					if (res.ok) {
						const data = (await res.json()) as any;
						const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
						if (text) {
							rawContent = text;
							break;
						}
					} else {
						lastErrorText = await res.text();
						if (res.status !== 503 && res.status !== 429) {
							break;
						}
					}
				} catch (fetchErr: any) {
					lastErrorText = fetchErr?.message || "Timeout connecting to Gemini generateContent";
				}
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
