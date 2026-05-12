import { Link, Navigate, useParams } from "react-router-dom";
import { posts } from "#velite";
import { AllTagsNav } from "../components/AllTagsNav";
import { PostTagList } from "../components/PostTagList";
import { getAuthorBySlug } from "../lib/authors";
import { getTagBySlug } from "../lib/tags";

function publishedPosts() {
	return posts.filter((p) => !p.draft);
}

export function BlogTagPage() {
	const { tagSlug } = useParams<{ tagSlug: string }>();
	const tag = tagSlug ? getTagBySlug(tagSlug) : undefined;

	if (!tagSlug) {
		return <Navigate to="/blog" replace />;
	}

	if (!tag) {
		return (
			<>
				<h2 className="page-title">Unknown tag</h2>
				<p>
					There is no tag <code>{tagSlug}</code>.{" "}
					<Link to="/blog">Back to blog</Link>
				</p>
			</>
		);
	}

	const list = publishedPosts()
		.filter((p) => p.tags.includes(tagSlug))
		.slice()
		.sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
		);

	return (
		<>
			<Link to="/blog" className="blog-post__back">
				← All posts
			</Link>
			<h2 className="page-title">
				Posts tagged <span className="page-title__tag">{tag.label}</span>
			</h2>
			<AllTagsNav activeTagSlug={tagSlug} />
			{list.length === 0 ? (
				<p className="content-card page-card">No posts use this tag yet.</p>
			) : (
				<ul className="blog-list content-card page-card">
					{list.map((post) => {
						const author = getAuthorBySlug(post.author);
						return (
							<li key={post.slug} className="blog-list__item">
								<Link to={`/blog/${post.slug}`} className="blog-list__link">
									<span className="blog-list__post-title">{post.title}</span>
									<time
										className="blog-list__date"
										dateTime={post.date}
									>
										{new Date(post.date).toLocaleDateString(undefined, {
											year: "numeric",
											month: "short",
											day: "numeric",
										})}
									</time>
								</Link>
								{author ? (
									<p className="blog-list__author">By {author.name}</p>
								) : null}
								<PostTagList tagSlugs={post.tags} />
								{post.description ? (
									<p className="blog-list__desc">{post.description}</p>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
		</>
	);
}
