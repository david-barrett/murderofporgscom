import { Link } from "react-router-dom";
import type { AdjacentPost } from "../lib/postNav";

type Props = {
	older: AdjacentPost | null;
	newer: AdjacentPost | null;
};

export function PostAdjacentNav({ older, newer }: Props) {
	if (!older && !newer) {
		return null;
	}

	return (
		<nav className="blog-post__adjacent" aria-label="Previous and next posts">
			<div className="blog-post__adjacent-cell">
				{older ? (
					<Link to={`/blog/${older.slug}`} className="blog-post__adjacent-link">
						<span className="blog-post__adjacent-dir">Older</span>
						<span className="blog-post__adjacent-title">{older.title}</span>
					</Link>
				) : (
					<span className="blog-post__adjacent-empty" aria-hidden="true" />
				)}
			</div>
			<div className="blog-post__adjacent-cell blog-post__adjacent-cell--next">
				{newer ? (
					<Link to={`/blog/${newer.slug}`} className="blog-post__adjacent-link">
						<span className="blog-post__adjacent-dir">Newer</span>
						<span className="blog-post__adjacent-title">{newer.title}</span>
					</Link>
				) : (
					<span className="blog-post__adjacent-empty" aria-hidden="true" />
				)}
			</div>
		</nav>
	);
}
