import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configuredBase = process.env.PAGES_BASE_PATH ?? "/signature-studio/";
const base = configuredBase.endsWith("/")
  ? configuredBase
  : `${configuredBase}/`;

export default defineConfig({
  root: "github-pages",
  base,
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../out",
    emptyOutDir: true,
  },
});
