import { posts } from "#velite";

export type AdjacentPost = { slug: string; title: string };

function publishedChronological() {
	return posts
		.filter((p) => !p.draft)
		.slice()
		.sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
		);
}

/** Older = earlier publish date; newer = later date. */
export function adjacentPublishedPosts(slug: string): {
	older: AdjacentPost | null;
	newer: AdjacentPost | null;
} {
	const list = publishedChronological();
	const i = list.findIndex((p) => p.slug === slug);
	if (i === -1) {
		return { older: null, newer: null };
	}
	const pick = (p: (typeof list)[number]): AdjacentPost => ({
		slug: p.slug,
		title: p.title,
	});
	return {
		older: i > 0 ? pick(list[i - 1]!) : null,
		newer: i < list.length - 1 ? pick(list[i + 1]!) : null,
	};
}
