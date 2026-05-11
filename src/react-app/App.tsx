import mopLogo from "./assets/mop_logo.jpeg";
import "./App.css";

function App() {
	return (
		<div className="app-layout">
			<header className="site-header">
				<img
					src={mopLogo}
					className="site-header__logo"
					alt="Murder of Porgs"
				/>
			</header>
			<main className="main-content">
				<h1>Murder of Porgs</h1>
				<h2>A SWU Team</h2>
				<section className="links-card" aria-labelledby="links-heading">
					<h3 id="links-heading">Links</h3>
					<ul>
						<li>
							<a href="https://hri.gg/teams/mop">Holocron Rating Index</a>
						</li>
						<li>
							<a href="https://leisuregames.com/">Leisure Games</a>
						</li>
					</ul>
				</section>
			</main>
		</div>
	);
}

export default App;
