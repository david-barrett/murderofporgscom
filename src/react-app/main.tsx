import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import favicon from "./assets/mop_favicon.jpeg";
import "./index.css";
import App from "./App.tsx";

const icon = document.createElement("link");
icon.rel = "icon";
icon.type = "image/jpeg";
icon.href = favicon;
document.head.appendChild(icon);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<HelmetProvider>
			<App />
		</HelmetProvider>
	</StrictMode>,
);
