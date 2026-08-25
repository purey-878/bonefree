import { access } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { loadApplicationBuild } from './application-manifest.mjs'

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function optionValue(args, name) {
  const equalsForm = args.find((argument) => argument.startsWith(`${name}=`))
  if (equalsForm) return equalsForm.slice(name.length + 1)
  const optionIndex = args.indexOf(name)
  return optionIndex >= 0 ? args[optionIndex + 1] : undefined
}

function runNodeScript(scriptPath, args, environment) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: frontendDir,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const args = process.argv.slice(2)
const tenant = optionValue(args, '--tenant')
const outDir = optionValue(args, '--out-dir')
await loadApplicationBuild(frontendDir, tenant)

const typeScriptBin = path.join(frontendDir, 'node_modules', 'typescript', 'bin', 'tsc')
const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
await Promise.all([access(typeScriptBin), access(viteBin)])

const environment = {
  ...process.env,
  APPLICATION_BUILD_TARGET: tenant ?? '',
  APPLICATION_BUILD_ID: process.env.BUILD_ID ?? process.env.GITHUB_SHA ?? 'local',
  APPLICATION_OUT_DIR: outDir ?? '',
}
runNodeScript(typeScriptBin, ['-b'], environment)
runNodeScript(viteBin, ['build'], environment)
