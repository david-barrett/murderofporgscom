import { getSiteOrigin } from "./site";

/** First `<img src>` in HTML; returns absolute URL for og:image, or undefined. */
export function firstImageUrlFromHtml(html: string): string | undefined {
	const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
	if (!m?.[1]) {
		return undefined;
	}
	const src = m[1].trim();
	if (src.startsWith("http://") || src.startsWith("https://")) {
		return src;
	}
	const origin = getSiteOrigin();
	if (src.startsWith("/")) {
		return `${origin}${src}`;
	}
	return `${origin}/${src}`;
}
