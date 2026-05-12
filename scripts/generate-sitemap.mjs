import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const veliteDir = path.join(root, ".velite");
const publicDir = path.join(root, "public");

const SITE = (
	process.env.VITE_SITE_URL || "https://murderofporgs.com"
).replace(/\/$/, "");

function escapeXml(s) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function addUrl(lines, locPath, lastmod) {
	const loc = `${SITE}${locPath}`;
	let block = `  <url>\n    <loc>${escapeXml(loc)}</loc>`;
	if (lastmod) {
		block += `\n    <lastmod>${escapeXml(lastmod)}</lastmod>`;
	}
	block += "\n  </url>";
	lines.push(block);
}

const postsPath = path.join(veliteDir, "posts.json");
const tagsPath = path.join(veliteDir, "tags.json");

if (!fs.existsSync(postsPath) || !fs.existsSync(tagsPath)) {
	console.error(
		"generate-sitemap: missing .velite data. Run `velite build` first.",
	);
	process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(postsPath, "utf8"));
const tags = JSON.parse(fs.readFileSync(tagsPath, "utf8"));

const lines = [];
addUrl(lines, "/");
addUrl(lines, "/links");
addUrl(lines, "/blog");

for (const t of tags) {
	addUrl(lines, `/blog/tag/${t.slug}`);
}

for (const p of posts) {
	if (p.draft) {
		continue;
	}
	const lastmod =
		typeof p.date === "string" ? p.date.slice(0, 10) : undefined;
	addUrl(lines, `/blog/${p.slug}`, lastmod);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lines.join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

fs.mkdirSync(publicDir, { recursive: true });

const ogSrc = path.join(root, "src/react-app/assets/mop_logo.jpeg");
const ogDest = path.join(publicDir, "og-default.jpeg");
if (fs.existsSync(ogSrc)) {
	fs.copyFileSync(ogSrc, ogDest);
}

fs.writeFileSync(path.join(publicDir, "sitemap.xml"), xml, "utf8");
fs.writeFileSync(path.join(publicDir, "robots.txt"), robots, "utf8");

console.log(
	`generate-sitemap: wrote public/sitemap.xml (${lines.length} URLs) and public/robots.txt (Sitemap: ${SITE}/sitemap.xml)`,
);
