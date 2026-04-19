/* eslint-env node */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Backend defaults to server/config/config.js default port (5000)
  const backendOrigin = env.VITE_BACKEND_ORIGIN || "http://localhost:5000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        // Any client call to /api/* will go to backend.
        // If backend is not running, the frontend will fail (as desired).
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
