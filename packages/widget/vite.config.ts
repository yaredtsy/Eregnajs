import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@repo/ui/vite-tailwind";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "EregnaWidget",
      formats: ["es", "iife"],
      fileName: (format) =>
        format === "es" ? "eregna-widget.mjs" : "eregna-widget.iife.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "eregna-widget.[ext]",
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
