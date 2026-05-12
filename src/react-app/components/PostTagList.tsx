import { Link, useParams } from "react-router-dom";
import { resolveTagsForPost } from "../lib/tags";

type PostTagListProps = {
	tagSlugs: string[];
};

export function PostTagList({ tagSlugs }: PostTagListProps) {
	const { tagSlug: activeTagSlug } = useParams<{ tagSlug?: string }>();

	if (tagSlugs.length === 0) {
		return null;
	}

	const resolved = resolveTagsForPost(tagSlugs);

	return (
		<ul className="tag-list" aria-label="Tags">
			{resolved.map(({ slug, label }) => {
				const isCurrent = activeTagSlug === slug;
				return (
					<li key={slug}>
						<Link
							to={`/blog/tag/${slug}`}
							className={
								isCurrent ? "tag-pill tag-pill--link tag-pill--current" : "tag-pill tag-pill--link"
							}
							aria-current={isCurrent ? "page" : undefined}
						>
							{label}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
