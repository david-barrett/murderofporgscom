import { Link, useLocation } from "react-router-dom";
import { Seo } from "../components/Seo";
import { SITE_NAME } from "../lib/site";

export function NotFoundPage() {
	const { pathname } = useLocation();

	return (
		<>
			<Seo
				title="Page not found"
				description={`That URL is not part of the ${SITE_NAME} site.`}
				path={pathname}
				noIndex
			/>
			<section className="content-card page-card not-found">
				<h2 className="page-title">Page not found</h2>
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
