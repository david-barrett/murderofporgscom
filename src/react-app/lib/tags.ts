import { tags } from "#velite";

export function getTagBySlug(slug: string) {
	return tags.find((t) => t.slug === slug);
}

export function resolveTagsForPost(tagSlugs: string[]) {
	return tagSlugs.map((slug) => {
		const tag = getTagBySlug(slug);
		return { slug, label: tag?.label ?? slug };
	});
}
