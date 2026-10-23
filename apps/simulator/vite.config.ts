import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Same variable and default as the MCP server.
  define: { __HK_PORT__: JSON.stringify(process.env.HK_PORT || "8787") },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
