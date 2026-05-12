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

### Metrics and local D1

Blog posts and a few fixed routes record views in the `post_metrics` table. Reserved route slugs (for `/`, `/links`, and `/blog`) are `route-home`, `route-links`, and `route-blog`.

Inspect local rows:

```bash
npx wrangler d1 execute murderofporgs-metrics --local --command "SELECT slug, views, likes FROM post_metrics ORDER BY slug"
```

The UI records at most **one view per browser tab** per slug using `sessionStorage`. To test another increment in the same tab, clear session storage for the site in devtools, or use a new private/incognito window.

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
