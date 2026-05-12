import { defineCollection, defineConfig, s } from "velite";

const authors = defineCollection({
	name: "authors",
	pattern: "authors/**/*.yml",
	schema: s.object({
		name: s.string().max(120),
		slug: s.slug("authors"),
		bio: s.string().max(2000).optional(),
	}),
});

const tags = defineCollection({
	name: "tags",
	pattern: "tags/**/*.yml",
	schema: s.object({
		label: s.string().max(80),
		slug: s.slug("tags"),
		description: s.string().max(500).optional(),
	}),
});

const posts = defineCollection({
	name: "posts",
	pattern: "blog/**/*.md",
	schema: s.object({
		title: s.string().max(200),
		slug: s.slug("global"),
		date: s.isodate(),
		description: s.string().max(500).optional(),
		draft: s.boolean().optional(),
		author: s.string().max(80),
		tags: s.array(s.string().max(40)),
		content: s.markdown(),
	}),
});

export default defineConfig({
	root: "content",
	output: {
		data: ".velite",
		clean: true,
	},
	collections: { authors, tags, posts },
});
