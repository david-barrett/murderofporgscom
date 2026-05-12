import { Link } from "react-router-dom";
import { tags } from "#velite";

type AllTagsNavProps = {
	/** When set (e.g. on `/blog/tag/:slug`), show an “All posts” control and highlight the active tag. */
	activeTagSlug?: string;
};

export function AllTagsNav({ activeTagSlug }: AllTagsNavProps) {
	const sorted = tags
		.slice()
		.sort((a, b) =>
			a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
		);

	if (sorted.length === 0) {
		return null;
	}

	const onTagFilter = activeTagSlug !== undefined;

	return (
		<nav className="blog-all-tags" aria-label="Browse posts by tag">
			<p className="blog-all-tags__label">Tags</p>
			<ul className="tag-list tag-list--all">
				{onTagFilter ? (
					<li key="_all-posts">
						<Link
							to="/blog"
							className="tag-pill tag-pill--link tag-pill--all-posts"
						>
							All posts
						</Link>
					</li>
				) : null}
				{sorted.map((t) => {
					const isCurrent = activeTagSlug === t.slug;
					return (
						<li key={t.slug}>
							<Link
								to={`/blog/tag/${t.slug}`}
								className={
									isCurrent
										? "tag-pill tag-pill--link tag-pill--current"
										: "tag-pill tag-pill--link"
								}
								aria-current={isCurrent ? "page" : undefined}
							>
								{t.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
