import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./layout/SiteLayout";
import { BlogIndexPage } from "./pages/BlogIndexPage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { BlogTagPage } from "./pages/BlogTagPage";
import { HomePage } from "./pages/HomePage";
import { LinksPage } from "./pages/LinksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import "./App.css";

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route element={<SiteLayout />}>
					<Route index element={<HomePage />} />
					<Route path="links" element={<LinksPage />} />
					<Route path="blog" element={<BlogIndexPage />} />
					<Route path="blog/tag/:tagSlug" element={<BlogTagPage />} />
					<Route path="blog/:slug" element={<BlogPostPage />} />
					<Route path="*" element={<NotFoundPage />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}
