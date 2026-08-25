/// <reference types="vite/client" />

declare module 'virtual:application-manifest' {
  const manifest: import('./app/manifest/types').ApplicationManifest
  export default manifest
}
