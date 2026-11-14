import { PageViewMetrics } from "../components/PageViewMetrics";
import { Seo } from "../components/Seo";

export function LinksPage() {
	return (
		<>
			<Seo
				title="Links"
				description="Discord, Holocron Rating Index, Leisure Games, and other links for Murder of Porgs, a Star Wars: Unlimited team."
				path="/links"
			/>
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
						href="https://leisuregames.com"
						target="_blank"
						rel="noopener noreferrer"
					>
						Leisure Games
					</a>
				</li>
			<li>
				<div className="social-content">
					<span className="handle">@theswunmatchedpainter</span>
					<a href="https://www.instagram.com/theswunmatchedpainter" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
						<i className="fa-brands fa-instagram"></i>
					</a>
					<a href="https://www.tiktok.com/@theswunmatchedpainter" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
						<i className="fa-brands fa-tiktok"></i>
					</a>
				</div>
			</li>
			</ul>
			<PageViewMetrics route="links" />
			</section>
		</>
	);
}
