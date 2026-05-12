import { useCallback, useEffect, useState } from "react";

type Metrics = { likes: number; views: number };

function viewSessionKey(slug: string) {
	return `post_view_recorded:${slug}`;
}

function likeSessionKey(slug: string) {
	return `post_like_recorded:${slug}`;
}

export function PostMetrics({ slug }: { slug: string }) {
	const [metrics, setMetrics] = useState<Metrics | null>(null);
	const [likeBusy, setLikeBusy] = useState(false);
	const [hasLiked, setHasLiked] = useState(() =>
		typeof sessionStorage !== "undefined" &&
			!!sessionStorage.getItem(likeSessionKey(slug)),
	);

	useEffect(() => {
		setHasLiked(
			typeof sessionStorage !== "undefined" &&
				!!sessionStorage.getItem(likeSessionKey(slug)),
		);
	}, [slug]);

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

	const onLike = async () => {
		if (hasLiked || likeBusy || metrics === null) {
			return;
		}
		setLikeBusy(true);
		try {
			const r = await fetch(`/api/metrics/${encodeURIComponent(slug)}/like`, {
				method: "POST",
			});
			if (!r.ok) {
				return;
			}
			const data = (await r.json()) as Metrics;
			sessionStorage.setItem(likeSessionKey(slug), "1");
			setHasLiked(true);
			setMetrics({
				likes: Number(data.likes) || 0,
				views: Number(data.views) || 0,
			});
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
				disabled={likeBusy || metrics === null || hasLiked}
				aria-label={hasLiked ? "You liked this post" : "Like this post"}
			>
				{hasLiked ? "Liked" : likeBusy ? "…" : "Like"}
			</button>
		</div>
	);
}
