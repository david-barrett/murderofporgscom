-- Per-post counters (likes + page views). slug matches Velite post slug.
CREATE TABLE IF NOT EXISTS post_metrics (
	slug TEXT PRIMARY KEY NOT NULL,
	likes INTEGER NOT NULL DEFAULT 0,
	views INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
