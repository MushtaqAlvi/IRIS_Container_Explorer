import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { URL } from 'node:url'

// GitHub Pages project sites are hosted below /<repository>/, while local
// development and custom domains are normally served from /. The deployment
// workflow sets VITE_BASE_PATH from configure-pages' base_path output.
const configuredBase = process.env.VITE_BASE_PATH || '/'
const base = configuredBase === '/' ? '/' : `${configuredBase.replace(/\/+$/, '')}/`

export default defineConfig({
  base,
  plugins: [react(), viteStaticCopy({ targets: [{ src: 'node_modules/@kaoto/camel-catalog/dist/camel-catalog', dest: '.' }] })],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        importers: [{
          findFileUrl(url: string) {
            return url.startsWith('~')
              ? new URL(`./node_modules/${url.slice(1)}`, import.meta.url)
              : null
          },
        }],
      },
    },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2, drop_console: true, drop_debugger: true },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
})
