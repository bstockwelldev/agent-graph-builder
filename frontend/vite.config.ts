import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Docker Desktop on Windows doesn't reliably propagate native filesystem
    // change events across the bind-mount boundary, so chokidar's default
    // watcher silently misses edits (files update on disk, but Vite keeps
    // serving stale transformed modules until the container is restarted).
    // Polling sidesteps that -- it costs a bit of CPU but actually works.
    watch: { usePolling: true, interval: 300 },
  },
});
