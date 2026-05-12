import { useCallback, useEffect, useState } from "react";
import { SHOW_PUBLIC_VIEW_COUNTS } from "../lib/site";

/** Reserved metrics keys for non-post routes (must match worker slug validation). */
export const ROUTE_METRICS_SLUG = {
	home: "route-home",
	links: "route-links",
	blog: "route-blog",
} as const;

export type RouteMetricsKey = keyof typeof ROUTE_METRICS_SLUG;

type Metrics = { likes: number; views: number };

function viewSessionKey(slug: string) {
	return `post_view_recorded:${slug}`;
}

export function PageViewMetrics({ route }: { route: RouteMetricsKey }) {
	const slug = ROUTE_METRICS_SLUG[route];
	const [metrics, setMetrics] = useState<Metrics | null>(null);

	const loadMetrics = useCallback(async () => {
		const r = await fetch(`/api/metrics/${encodeURIComponent(slug)}`);
		if (!r.ok) {
			return;
		}
		const data = (await r.json()) as Metrics;
		setMetrics({
			likes: Number(data.likes) || 0,
			views: Number(data.views) || 0,
		});
	}, [slug]);

	useEffect(() => {
		let cancelled = false;

		async function init() {
			await loadMetrics();
			if (cancelled) {
				return;
			}

			const key = viewSessionKey(slug);
			if (sessionStorage.getItem(key)) {
				return;
			}
			const r = await fetch(`/api/metrics/${encodeURIComponent(slug)}/view`, {
				method: "POST",
			});
			if (!r.ok) {
				return;
			}
			const data = (await r.json()) as Metrics;
			sessionStorage.setItem(key, "1");
			if (cancelled) {
				return;
			}
			setMetrics({
				likes: Number(data.likes) || 0,
				views: Number(data.views) || 0,
			});
		}

		void init();
		return () => {
			cancelled = true;
		};
	}, [slug, loadMetrics]);

	if (!SHOW_PUBLIC_VIEW_COUNTS) {
		return null;
	}

	return (
		<div className="post-metrics post-metrics--page">
			<p className="post-metrics__counts" aria-live="polite">
				{metrics === null ? (
					<span className="post-metrics__loading">Loading stats…</span>
				) : (
					<span>{metrics.views} views</span>
				)}
			</p>
		</div>
	);
}
