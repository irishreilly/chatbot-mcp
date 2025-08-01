import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true, // Fail if port is in use instead of trying another port
    open: false, // Don't auto-open browser
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        timeout: 50000, // 50 second timeout for MCP operations
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('[Proxy Error]', err.message)
            if (!res.headersSent) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              })
              res.end(JSON.stringify({
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Backend service unavailable',
                  details: err.message
                }
              }))
            }
          })
          
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[Proxy] ${req.method} ${req.url}`)
          })
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@reduxjs/toolkit', 'react-redux']
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true
  }
})