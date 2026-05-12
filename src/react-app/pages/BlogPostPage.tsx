import { Link, Navigate, useParams } from "react-router-dom";
import { posts } from "#velite";
import { PostAdjacentNav } from "../components/PostAdjacentNav";
import { PostMetrics } from "../components/PostMetrics";
import { PostTagList } from "../components/PostTagList";
import { Seo } from "../components/Seo";
import { getAuthorBySlug } from "../lib/authors";
import { adjacentPublishedPosts } from "../lib/postNav";
import { DEFAULT_DESCRIPTION } from "../lib/site";
import { firstImageUrlFromHtml } from "../lib/og";
import { NotFoundPage } from "./NotFoundPage";

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
		return <NotFoundPage />;
	}

	const author = getAuthorBySlug(post.author);
	const description = post.description?.trim() || DEFAULT_DESCRIPTION;
	const ogImage = firstImageUrlFromHtml(post.content);
	const { older, newer } = adjacentPublishedPosts(post.slug);

	return (
		<>
			<Seo
				title={post.title}
				description={description}
				path={`/blog/${post.slug}`}
				ogType="article"
				ogImage={ogImage}
			/>
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
				<PostAdjacentNav older={older} newer={newer} />
				<PostMetrics slug={post.slug} />
			</article>
		</>
	);
}
