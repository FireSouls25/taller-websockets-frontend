import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5101 },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 150,
    reportCompressedSize: false,
  },
});
