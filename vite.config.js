import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Allows the frontend to resolve latest.json relative to the monorepo root
      // even when privarc-contracts-v2 is a sibling directory.
      // If building in CI without the contracts directory, set VITE_OVERRIDE_CONTRACTS=true.
      "../../privarc-contracts-v2/deployments/latest.json": path.resolve(
        __dirname,
        "../privarc-contracts-v2/deployments/latest.json"
      ),
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("react") || id.includes("react-dom")) return "react";
          if (id.includes("Landing.jsx"))  return "landing";
          if (id.includes("DApp.jsx"))     return "dapp";
        },
      },
    },
  },
})
