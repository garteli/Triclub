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
      // These native-only plugins are loaded at runtime inside the native shell (behind
      // dynamic import() gated on Capacitor.isNativePlatform()), so keep them out of the
      // web bundle — a web-only install doesn't need them present.
      // NB: do NOT externalize @capacitor/core. oauth.js imports it statically, so
      // externalizing leaves a bare `import '@capacitor/core'` the browser can't resolve
      // and the web SPA never mounts (stuck on splash). It's a dependency, so it bundles.
      external: ['@capacitor-community/background-geolocation', '@capacitor-community/bluetooth-le', '@perfood/capacitor-healthkit'],
    },
  },
  server: {
    // Honor a harness/CI-assigned PORT when present, else the conventional dev port.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    // Dev-only: forward API + realtime to the .NET host (`dotnet run` → http://localhost:5186).
    // Production serves the built SPA from the same origin, so no proxy is needed there.
    proxy: {
      '/api': { target: 'http://localhost:5186', changeOrigin: true },
      '/hubs': { target: 'http://localhost:5186', changeOrigin: true, ws: true },
    },
  },
})
