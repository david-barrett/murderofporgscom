import { Helmet } from "react-helmet-async";
import { DEFAULT_DESCRIPTION, SITE_NAME, getSiteOrigin } from "../lib/site";

export type SeoProps = {
	/** Short title (shown in og:title; combined with site name in `<title>`). */
	title: string;
	description?: string;
	path: string;
	ogType?: "website" | "article";
	/** Absolute URL preferred; relative `/…` resolved against site origin. */
	ogImage?: string;
	noIndex?: boolean;
};

function normalizePath(path: string) {
	if (!path.startsWith("/")) {
		return `/${path}`;
	}
	return path === "" ? "/" : path;
}

function absoluteOgImage(ogImage: string | undefined, origin: string) {
	if (!ogImage) {
		return `${origin}/og-default.jpeg`;
	}
	if (ogImage.startsWith("http://") || ogImage.startsWith("https://")) {
		return ogImage;
	}
	if (ogImage.startsWith("/")) {
		return `${origin}${ogImage}`;
	}
	return `${origin}/${ogImage}`;
}

export function Seo({
	title,
	description = DEFAULT_DESCRIPTION,
	path,
	ogType = "website",
	ogImage,
	noIndex,
}: SeoProps) {
	const origin = getSiteOrigin();
	const canonical = `${origin}${normalizePath(path)}`;
	const documentTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
	const imageUrl = absoluteOgImage(ogImage, origin);

	return (
		<Helmet htmlAttributes={{ lang: "en" }} prioritizeSeoTags>
			<title>{documentTitle}</title>
			<meta name="description" content={description} />
			<link rel="canonical" href={canonical} />
			{noIndex ? <meta name="robots" content="noindex" /> : null}

			<meta property="og:title" content={title} />
			<meta property="og:description" content={description} />
			<meta property="og:url" content={canonical} />
			<meta property="og:type" content={ogType} />
			<meta property="og:site_name" content={SITE_NAME} />
			<meta property="og:image" content={imageUrl} />

			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:title" content={title} />
			<meta name="twitter:description" content={description} />
			<meta name="twitter:image" content={imageUrl} />
		</Helmet>
	);
}
