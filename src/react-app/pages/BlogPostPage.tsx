import { Link, Navigate, useParams } from "react-router-dom";
import { posts } from "#velite";
import { PostTagList } from "../components/PostTagList";
import { getAuthorBySlug } from "../lib/authors";

function publishedPosts() {
	return posts.filter((p) => !p.draft);
}

export function BlogPostPage() {
	const { slug } = useParams<{ slug: string }>();
	const post = publishedPosts().find((p) => p.slug === slug);

	if (!slug) {
		return <Navigate to="/blog" replace />;
	}

	if (!post) {
		return (
			<>
				<h2 className="page-title">Not found</h2>
				<p>
					No post matches that address.{" "}
					<Link to="/blog">Back to blog</Link>
				</p>
			</>
		);
	}

	const author = getAuthorBySlug(post.author);

	return (
		<article className="blog-post page-card">
			<Link to="/blog" className="blog-post__back">
				← Blog
			</Link>
			<h2 className="blog-post__title">{post.title}</h2>
			<p className="blog-post__meta">
				<time className="blog-post__date" dateTime={post.date}>
					{new Date(post.date).toLocaleDateString(undefined, {
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
				</time>
				{author ? (
					<>
						{" · "}
						<span className="blog-post__author">By {author.name}</span>
					</>
				) : null}
			</p>
			<PostTagList tagSlugs={post.tags} />
			{post.description ? (
				<p className="blog-post__lede">{post.description}</p>
			) : null}
			<div
				className="blog-post__body"
				dangerouslySetInnerHTML={{ __html: post.content }}
			/>
		</article>
	);
}
