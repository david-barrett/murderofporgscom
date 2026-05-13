import { useCallback, useEffect, useState } from "react";
import favicon from "../assets/mop_favicon.jpeg";
import { SHOW_PUBLIC_VIEW_COUNTS } from "../lib/site";

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
						{SHOW_PUBLIC_VIEW_COUNTS ? (
							<>
								<span>{metrics.views} views</span>
								<span className="post-metrics__sep" aria-hidden="true">
									{" "}
									·{" "}
								</span>
							</>
						) : null}
						<span>{metrics.likes} porg{metrics.likes === 1 ? "" : "s"}</span>
					</>
				)}
			</p>
			<button
				type="button"
				className="post-metrics__like-btn"
				onClick={() => void onLike()}
				disabled={likeBusy || metrics === null || hasLiked}
				aria-label={hasLiked ? "You porged this post" : "Porg this post (add a porg)"}
			>
				{likeBusy ? (
					<span className="post-metrics__like-label">…</span>
				) : (
					<>
						<img
							className="post-metrics__like-icon"
							src={favicon}
							alt=""
							width={20}
							height={20}
							decoding="async"
							draggable={false}
						/>
						<span className="post-metrics__like-label">
							{hasLiked ? "Porged" : "Porg"}
						</span>
					</>
				)}
			</button>
		</div>
	);
}
