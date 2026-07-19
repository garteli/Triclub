import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The React app builds straight into the ASP.NET Core host's wwwroot,
// so `dotnet run` serves the compiled SPA with no extra copy step.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../Squad.Web/wwwroot',
    emptyOutDir: true,
    rollupOptions: {
      // Only loaded at runtime inside the native shell; keep them out of the web bundle
      // so a web-only install doesn't need the Capacitor packages present.
      external: ['@capacitor/core', '@capacitor-community/background-geolocation', '@capacitor-community/bluetooth-le'],
    },
  },
  server: {
    port: 5173,
    // Dev-only: forward API + realtime to the .NET host (`dotnet run` → http://localhost:5186).
    // Production serves the built SPA from the same origin, so no proxy is needed there.
    proxy: {
      '/api': { target: 'http://localhost:5186', changeOrigin: true },
      '/hubs': { target: 'http://localhost:5186', changeOrigin: true, ws: true },
    },
  },
})
