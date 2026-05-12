import { Link, useLocation } from "react-router-dom";
import sadPorg from "../assets/sad_porg.png";
import { Seo } from "../components/Seo";
import {
	NOT_FOUND_METRICS_SLUG,
	SilentPageView,
} from "../components/SilentPageView";
import { SITE_NAME } from "../lib/site";

export function NotFoundPage() {
	const { pathname } = useLocation();

	return (
		<>
			<SilentPageView slug={NOT_FOUND_METRICS_SLUG} />
			<Seo
				title="Page not found"
				description={`That URL is not part of the ${SITE_NAME} site.`}
				path={pathname}
				noIndex
			/>
			<section className="content-card page-card not-found">
				<h2 className="page-title">Page not found</h2>
				<img
					className="not-found__illustration"
					src={sadPorg}
					alt="Sad porg"
				/>
				<p className="not-found__path">
					Nothing matches <code>{pathname}</code>.
				</p>
				<p className="not-found__links">
					<Link to="/">Home</Link>
					{" · "}
					<Link to="/blog">Blog</Link>
					{" · "}
					<Link to="/links">Links</Link>
				</p>
			</section>
		</>
	);
}
