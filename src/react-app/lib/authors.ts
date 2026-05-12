import { authors } from "#velite";

export function getAuthorBySlug(slug: string) {
	return authors.find((a) => a.slug === slug);
}
