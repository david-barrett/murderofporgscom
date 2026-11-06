import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build as veliteBuild } from "velite";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
	resolve: {
		alias: {
			"#velite": path.resolve(rootDir, ".velite"),
		},
	},
	plugins: [
		tailwindcss(),
		react(),
		cloudflare(),
		{
			name: "velite-watch",
			async buildStart() {
				if (command === "serve") {
					await veliteBuild({ watch: true, clean: false });
				}
			},
		},
	],
}));
