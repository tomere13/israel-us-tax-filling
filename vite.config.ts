import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local-first: everything runs in the browser, no backend.
export default defineConfig({
  plugins: [react()],
  // pdfjs-dist ships a worker we load via ?url; keep it pre-bundled.
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  worker: {
    format: "es",
  },
});
