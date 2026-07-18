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
  },
})
