import { useEffect } from "react";

/** Reserved D1 `post_metrics.slug` for aggregate 404 hits (worker slug regex). */
export const NOT_FOUND_METRICS_SLUG = "route-not-found";

function viewSessionKey(slug: string) {
	return `post_view_recorded:${slug}`;
}

/**
 * Records one D1 view per browser tab (POST + sessionStorage after success, same as other
 * metrics), with no UI.
 */
export function SilentPageView({ slug }: { slug: string }) {
	useEffect(() => {
		async function run() {
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
			await r.json();
			sessionStorage.setItem(key, "1");
		}

		void run();
	}, [slug]);

	return null;
}
