export const SITE_NAME = "Murder of Porgs";

/** When false, view totals are still recorded in D1 but not shown in the UI. */
export const SHOW_PUBLIC_VIEW_COUNTS = false;

export const DEFAULT_DESCRIPTION =
	"A murder of porgs is the collective noun for a group of porgs. Star Wars: Unlimited team blog, links, and updates from Murder of Porgs.";

export function getSiteOrigin(): string {
	const fromEnv = import.meta.env.VITE_SITE_URL?.trim().replace(/\/$/, "");
	if (fromEnv) {
		return fromEnv;
	}
	if (typeof window !== "undefined" && window.location?.origin) {
		return window.location.origin;
	}
	return "https://murderofporgs.com";
}
