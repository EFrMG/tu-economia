import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  test: {
    server: { deps: { inline: [/opentelemetry/, /better-auth/] } },
  },
  plugins: [
    ...(mode === "test"
      ? []
      : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tailwindcss(),
    reactRouter(),
  ],
  optimizeDeps: {
    // Prebundle route dependencies before navigation so Vite does not reload an already-hydrated React tree.
    include: [
      "fast-xml-parser",
      "html-entities",
      "lenis",
      "motion/react",
      "react-icons/hi",
      "react-icons/md",
      "recharts",
      "zod",
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
}));
