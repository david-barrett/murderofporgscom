import { Link } from "react-router-dom";
import { posts } from "#velite";
import { AllTagsNav } from "../components/AllTagsNav";
import { PageViewMetrics } from "../components/PageViewMetrics";
import { PostTagList } from "../components/PostTagList";
import { getAuthorBySlug } from "../lib/authors";

function publishedPosts() {
	return posts
		.filter((p) => !p.draft)
		.slice()
		.sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
		);
}

export function BlogIndexPage() {
	const list = publishedPosts();

	if (list.length === 0) {
		return (
			<>
				<h2 className="page-title">Blog</h2>
				<AllTagsNav />
				<p className="content-card page-card">No posts yet.</p>
				<PageViewMetrics route="blog" />
			</>
		);
	}

	return (
		<>
			<h2 className="page-title">Blog</h2>
			<AllTagsNav />
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
			<PageViewMetrics route="blog" />
		</>
	);
}
