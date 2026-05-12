import { Link, NavLink, useOutlet } from "react-router-dom";
import mopLogo from "../assets/mop_logo.jpeg";

function navClass({ isActive }: { isActive: boolean }) {
	return isActive ? "site-nav__link site-nav__link--active" : "site-nav__link";
}

export function SiteLayout() {
	const outlet = useOutlet();

	return (
		<div className="app-layout">
			<header className="site-header">
				<div className="site-header__inner">
					<div className="site-header__leading">
						<Link to="/" className="site-header__brand">
							<img
								src={mopLogo}
								className="site-header__logo"
								alt="Murder of Porgs"
							/>
							<div className="site-header__titles">
								<h1 className="site-header__title">Murder of Porgs</h1>
								<h2 className="site-header__subtitle">A SWU Team</h2>
							</div>
						</Link>
					</div>
					<nav className="site-nav" aria-label="Site">
						<NavLink to="/blog" className={navClass}>
							Blog
						</NavLink>
						<NavLink to="/links" className={navClass}>
							Links
						</NavLink>
					</nav>
				</div>
			</header>
			<main className="main-content">
				{outlet ? <div className="route-outlet">{outlet}</div> : null}
			</main>
		</div>
	);
}
