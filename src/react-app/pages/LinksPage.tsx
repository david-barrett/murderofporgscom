import { PageViewMetrics } from "../components/PageViewMetrics";

export function LinksPage() {
	return (
		<section
			className="content-card links-card page-card"
			aria-labelledby="links-card-heading"
		>
			<h3 id="links-card-heading" className="links-card__title">
				Links
			</h3>
			
			<ul>
				<li>
					<a
						href="https://discord.gg/A7H7eaR56"
						target="_blank"
						rel="noopener noreferrer"
					>
						Discord Server
					</a>
				</li>
				<li>
					<a
						href="https://hri.gg/teams/mop"
						target="_blank"
						rel="noopener noreferrer"
					>
						Holocron Rating Index
					</a>
				</li>
				<li>
					<a
						href="https://leisuregames.com/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Leisure Games
					</a>
				</li>
			</ul>
			<PageViewMetrics route="links" />
		</section>
	);
}
