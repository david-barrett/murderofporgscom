import { Link } from "react-router-dom";
import { tags } from "#velite";

export function AllTagsNav() {
	const sorted = tags
		.slice()
		.sort((a, b) =>
			a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
		);

	if (sorted.length === 0) {
		return null;
	}

	return (
		<nav className="blog-all-tags" aria-label="Browse posts by tag">
			<p className="blog-all-tags__label">Tags</p>
			<ul className="tag-list tag-list--all">
				{sorted.map((t) => (
					<li key={t.slug}>
						<Link
							to={`/blog/tag/${t.slug}`}
							className="tag-pill tag-pill--link"
						>
							{t.label}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
