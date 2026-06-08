import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@repo/ui/vite-tailwind";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shared = {
  plugins: [tailwindcss(), react()],
};

// ESM library — imported by monorepo apps and downstream bundlers.
const esmBuild = defineConfig({
  ...shared,
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "EregnaWidget",
      formats: ["es"],
      fileName: () => "eregna-widget.mjs",
    },
    rollupOptions: {
      output: { assetFileNames: "eregna-widget.[ext]" },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});

// IIFE CDN embed — the self-bootstrapping script for the <script> tag.
const iifeBuild = defineConfig({
  ...shared,
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/embed-auto.ts"),
      name: "EregnaEmbed",
      formats: ["iife"],
      fileName: () => "embed.iife.js",
    },
    rollupOptions: {
      output: { assetFileNames: "embed.[ext]" },
    },
    sourcemap: true,
    emptyOutDir: false,
  },
});

export default process.env.VITE_BUILD_TARGET === "embed" ? iifeBuild : esmBuild;
