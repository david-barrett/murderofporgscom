# React + Vite + Hono + Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/vite-react-template)

This template provides a minimal setup for building a React application with TypeScript and Vite, designed to run on Cloudflare Workers. It features hot module replacement, ESLint integration, and the flexibility of Workers deployments.

![React + TypeScript + Vite + Cloudflare Workers](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fc7b4b62-442b-4769-641b-ad4422d74300/public)

<!-- dash-content-start -->

🚀 Supercharge your web development with this powerful stack:

- [**React**](https://react.dev/) - A modern UI library for building interactive interfaces
- [**Vite**](https://vite.dev/) - Lightning-fast build tooling and development server
- [**Hono**](https://hono.dev/) - Ultralight, modern backend framework
- [**Cloudflare Workers**](https://developers.cloudflare.com/workers/) - Edge computing platform for global deployment

### ✨ Key Features

- 🔥 Hot Module Replacement (HMR) for rapid development
- 📦 TypeScript support out of the box
- 🛠️ ESLint configuration included
- ⚡ Zero-config deployment to Cloudflare's global network
- 🎯 API routes with Hono's elegant routing
- 🔄 Full-stack development setup
- 🔎 Built-in Observability to monitor your Worker

Get started in minutes with local development or deploy directly via the Cloudflare dashboard. Perfect for building modern, performant web applications at the edge.

<!-- dash-content-end -->

## Getting Started

To start a new project with this template, run:

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/vite-react-template
```

A live deployment of this template is available at:
[https://react-vite-template.templates.workers.dev](https://react-vite-template.templates.workers.dev)

## Development

Install dependencies:

```bash
npm install
```

Apply D1 migrations to the **local** database (do this once, and again whenever you add a migration under `migrations/`):

```bash
npm run db:migrate:local
```

Start the development server with:

```bash
npm run dev
```

Your application will be available at [http://localhost:5173](http://localhost:5173). The Cloudflare Vite plugin runs the Worker alongside the client, so `/api/metrics/...` hits **local** D1, not production.

### SEO and sitemap

Route-level **title**, **meta description**, **canonical**, and **Open Graph / Twitter** tags are applied in the client with `react-helmet-async`. Set **`VITE_SITE_URL`** to your public origin (for example `https://murderofporgs.com`) in `.env.production` or the Cloudflare build environment so canonicals and social previews stay correct on preview URLs.

Every **`npm run build`** runs **`scripts/generate-sitemap.mjs`**, which refreshes **`public/sitemap.xml`**, **`public/robots.txt`**, and **`public/og-default.jpeg`** (used when a post has no lead image for `og:image`). The sitemap script defaults the site base to `https://murderofporgs.com` unless **`VITE_SITE_URL`** is set in the environment for that step.

**Checklist (after you are happy with the live domain):**

- **Should — `VITE_SITE_URL` in Cloudflare build:** Set to your canonical origin (e.g. `https://murderofporgs.com`) so preview deployments do not emit canonicals and Open Graph URLs pointing at `*.pages.dev`. On the real apex domain alone, runtime Helmet already uses `window.location.origin`, so production is fine without it; previews benefit most.
- **Should — Search Console:** Add the property and submit **`https://murderofporgs.com/sitemap.xml`** (or your canonical host + `/sitemap.xml`). Skipping this does not break the site; discovery may be slower.
- **Could — `www` vs apex:** Pick one public URL, redirect the other in Cloudflare, and set **`VITE_SITE_URL`** (and sitemap generation env) to that same host so links, sitemap, and `robots.txt` stay consistent.
- **Could — crawlers without JavaScript:** Per-page meta comes from Helmet in the browser; the shipped **`index.html`** only carries a default description. Bots that do not run JS see that default, not post-specific titles. Improving that would mean prerendering or HTML per route, not a small config tweak.

### Metrics and local D1

Blog posts and a few fixed routes record views in the `post_metrics` table. Reserved route slugs (for `/`, `/links`, `/blog`, and aggregate **404** hits) are `route-home`, `route-links`, `route-blog`, and `route-not-found` (404 views are counted but not shown on the page).

Inspect local rows:

```bash
npx wrangler d1 execute murderofporgs-metrics --local --command "SELECT slug, views, likes FROM post_metrics ORDER BY slug"
```

The UI records at most **one view per browser tab** per slug using `sessionStorage` (`post_view_recorded:<slug>`). **Likes** use the same pattern after a successful like (`post_like_recorded:<slug>`), and the Like control shows **Liked** and stays disabled. To test again in the same tab, clear those keys in devtools or use a new private/incognito window.

View counts are **hidden in the UI** when **`SHOW_PUBLIC_VIEW_COUNTS`** in `src/react-app/lib/site.ts` is `false` (the default); views are still written to D1. Set it to `true` to show “N views” on posts and route pages again.

**Debug dashboard (not linked in the nav):** open **`/debug/stats`** in the browser to see all `post_metrics` rows (slug, views, likes, `updated_at`) via **`GET /api/debug/stats`**. The page is **`noindex`** and omitted from the sitemap; it is still **public** if someone guesses the URL—treat it as convenience, not a secret.

For **production** schema changes, apply migrations remotely after deploy prep:

```bash
npm run db:migrate:remote
```

### Querying production D1

Use **`--remote`** instead of **`--local`** against the same database name (`murderofporgs-metrics`):

```bash
npx wrangler d1 execute murderofporgs-metrics --remote --command "SELECT slug, views, likes FROM post_metrics ORDER BY slug"
```

Ensure Wrangler is authenticated to the account that owns the database:

```bash
npx wrangler login
```

You can also open the database in the [Cloudflare dashboard](https://dash.cloudflare.com): **Workers & Pages** → **D1** → **murderofporgs-metrics**, and run queries from the console there.

`--remote` targets **live** production data; use **`--local`** for development and experiments unless you intend to read or change production.

## Production

Build your project for production:

```bash
npm run build
```

Preview your build locally:

```bash
npm run preview
```

Deploy your project to Cloudflare Workers:

```bash
npm run build && npm run deploy
```

Monitor your workers:

```bash
npx wrangler tail
```

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Vite Documentation](https://vitejs.dev/guide/)
- [React Documentation](https://reactjs.org/)
- [Hono Documentation](https://hono.dev/)
