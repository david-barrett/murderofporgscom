import { useCallback, useEffect, useState } from "react";

type Metrics = { likes: number; views: number };

function viewSessionKey(slug: string) {
	return `post_view_recorded:${slug}`;
}

export function PostMetrics({ slug }: { slug: string }) {
	const [metrics, setMetrics] = useState<Metrics | null>(null);
	const [likeBusy, setLikeBusy] = useState(false);

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
			sessionStorage.setItem(key, "1");
			const r = await fetch(`/api/metrics/${encodeURIComponent(slug)}/view`, {
				method: "POST",
			});
			if (cancelled || !r.ok) {
				return;
			}
			const data = (await r.json()) as Metrics;
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

	const onLike = async () => {
		setLikeBusy(true);
		try {
			const r = await fetch(`/api/metrics/${encodeURIComponent(slug)}/like`, {
				method: "POST",
			});
			if (r.ok) {
				const data = (await r.json()) as Metrics;
				setMetrics({
					likes: Number(data.likes) || 0,
					views: Number(data.views) || 0,
				});
			}
		} finally {
			setLikeBusy(false);
		}
	};

	return (
		<div className="post-metrics">
			<p className="post-metrics__counts" aria-live="polite">
				{metrics === null ? (
					<span className="post-metrics__loading">Loading stats…</span>
				) : (
					<>
						<span>{metrics.views} views</span>
						<span className="post-metrics__sep" aria-hidden="true">
							{" "}
							·{" "}
						</span>
						<span>{metrics.likes} likes</span>
					</>
				)}
			</p>
			<button
				type="button"
				className="post-metrics__like-btn"
				onClick={() => void onLike()}
				disabled={likeBusy || metrics === null}
				aria-label="Like this post"
			>
				{likeBusy ? "…" : "Like"}
			</button>
		</div>
	);
}
