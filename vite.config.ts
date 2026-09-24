import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this repo's site from the project subpath
// https://devonv-nitor.github.io/tram-view/, so every asset URL is built
// with the /tram-view/ base and a hard refresh at the subpath resolves.
// The dev server serves at the same subpath. Deployment: Docs/deployment.md.
export default defineConfig({
  base: "/tram-view/",
  plugins: [react()],
});
