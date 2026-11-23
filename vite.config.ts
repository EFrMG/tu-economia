import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    exclude: [...configDefaults.exclude, "DOCS/**"],
    server: { deps: { inline: [/opentelemetry/, /better-auth/] } },
  },
  plugins: [
    ...(mode === "test"
      ? []
      : [
          cloudflare({
            viteEnvironment: { name: "ssr" },
            // Off by default: the Workers AI binding is always remote and needs a Wrangler login; it is only used by the Boletín digest.
            remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === "true",
          }),
        ]),
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
