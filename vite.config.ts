import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "html-build-cache-bust",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          `  <meta name="app-build" content="${Date.now()}" />\n  </head>`
        );
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: [
      { find: /^@\/integrations\/supabase\/client(.*)$/, replacement: path.resolve(__dirname, "./src/lib/api.ts") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
}));
