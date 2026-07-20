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
      // Do NOT externalize packages that source code import()s by name. The native
      // shell loads the *same* bundle as the web build, so an external leaves a bare
      // specifier like `import("@perfood/capacitor-healthkit")` that no webview can
      // resolve — Apple Health and BLE sensors then fail at runtime with a module
      // resolution error. Keeping them bundled is free: they're behind dynamic
      // import() gated on Capacitor.isNativePlatform(), so Rollup already splits them
      // into their own chunks and a web install never fetches them.
      // (@capacitor-community/background-geolocation is reached via registerPlugin()
      // rather than a direct import, so it never needed listing here either.)
      external: [],
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
