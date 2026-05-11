import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import favicon from "./assets/mop_logo.jpeg";
import "./index.css";
import App from "./App.tsx";

const icon = document.createElement("link");
icon.rel = "icon";
icon.type = "image/jpeg";
icon.href = favicon;
document.head.appendChild(icon);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
