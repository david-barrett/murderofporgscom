import { PageViewMetrics } from "../components/PageViewMetrics";

export function HomePage() {
	return (
		<section className="content-card definition-card page-card">
			<p>
				A &quot;murder of porgs&quot; is the specific collective noun used to
				describe a group of porgs.
			</p>
			<PageViewMetrics route="home" />
		</section>
	);
}
