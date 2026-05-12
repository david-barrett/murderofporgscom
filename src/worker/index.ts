import { Hono } from "hono";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(slug: string): boolean {
	return slug.length > 0 && slug.length <= 160 && SLUG_RE.test(slug);
}

const app = new Hono<{ Bindings: Env }>();

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

app.all("*", async (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
