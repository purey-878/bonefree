import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

import {
  buildMetadata,
  loadApplicationBuild,
  renderVirtualManifest,
} from './build/scripts/application-manifest.mjs'

const VIRTUAL_MANIFEST_ID = 'virtual:application-manifest'
const RESOLVED_VIRTUAL_MANIFEST_ID = `\0${VIRTUAL_MANIFEST_ID}`

export default defineConfig(async () => {
  const rootDir = path.resolve(import.meta.dirname)
  const applicationConfiguration = await loadApplicationBuild(
    rootDir,
    process.env.APPLICATION_BUILD_TARGET || undefined,
  )
  const configuration = applicationConfiguration
  const buildId = process.env.APPLICATION_BUILD_ID || 'development'
  const applicationManifestPlugin: Plugin = {
    name: 'application-manifest',
    resolveId(id) {
      return id === VIRTUAL_MANIFEST_ID ? RESOLVED_VIRTUAL_MANIFEST_ID : undefined
    },
    load(id) {
      return id === RESOLVED_VIRTUAL_MANIFEST_ID
        ? renderVirtualManifest(configuration, buildId)
        : undefined
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-manifest.json',
        source: `${JSON.stringify(buildMetadata(configuration, buildId), null, 2)}\n`,
      })
    },
  }

  return {
    plugins: [applicationManifestPlugin, react()],
    build: {
      outDir: process.env.APPLICATION_OUT_DIR || 'dist',
    },
  }
})
