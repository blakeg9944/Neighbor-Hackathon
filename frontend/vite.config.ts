import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fixed port: Supabase auth redirect URLs and the Chrome extension point at localhost:5173.
  server: { port: 5173, strictPort: true },
});
