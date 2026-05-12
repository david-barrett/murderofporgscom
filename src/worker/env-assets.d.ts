/** Static asset handler injected at runtime with Workers + assets; not always in `wrangler types` output. */
declare namespace Cloudflare {
	interface Env {
		ASSETS: { fetch: typeof fetch };
	}
}
