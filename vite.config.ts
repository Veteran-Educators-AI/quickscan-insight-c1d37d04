import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Hardcoded fallback values for Cloud env vars
// UPDATED: Now pointing to NYClogic AI (Scholar Quest) shared database
const FALLBACK_SUPABASE_URL = 'https://pbqgmvshxkhkrhoxvyws.supabase.co';
const FALLBACK_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBicWdtdnNoeGtoa3Job3h2eXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjU2MDksImV4cCI6MjA4Njk0MTYwOX0.JsySVF_HUpkzxxNokNITdujeoCfTeWut2SxuNhjWK_w';
const FALLBACK_SUPABASE_PROJECT_ID = 'pbqgmvshxkhkrhoxvyws';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      // Always define these with fallbacks to ensure they're available
      // Always use the shared database credentials (ignore .env overrides from Cloud)
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(FALLBACK_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(FALLBACK_SUPABASE_KEY),
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(FALLBACK_SUPABASE_PROJECT_ID),
    },
    build: {
      target: "esnext",
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
      },
    },
  };
});
