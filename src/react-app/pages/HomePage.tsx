import { PageViewMetrics } from "../components/PageViewMetrics";
import { Seo } from "../components/Seo";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "../lib/site";

export function HomePage() {
	return (
		<>
			<Seo title={SITE_NAME} description={DEFAULT_DESCRIPTION} path="/" />
			<section className="content-card definition-card page-card">
				<p>
					A &quot;murder of porgs&quot; is the specific collective noun used to
					describe a group of porgs.
				</p>
				<PageViewMetrics route="home" />
			</section>
		</>
	);
}
