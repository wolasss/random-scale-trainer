import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    // Lets a Docker-hosted Selenium browser reach the e2e preview server
    allowedHosts: ['host.docker.internal'],
  },
})
