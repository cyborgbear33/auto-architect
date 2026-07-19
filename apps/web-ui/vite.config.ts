import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

const AUTO_PACKAGES = ["@auto/semantic-types"];

export default defineConfig({
  plugins: [react(), tailwind()],
  // Workspace packages ship TS source; let Vite transform them rather than
  // trying to pre-bundle them as opaque dependencies.
  optimizeDeps: { exclude: AUTO_PACKAGES },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4100", changeOrigin: true },
      "/health": { target: "http://localhost:4100", changeOrigin: true },
    },
  },
});
