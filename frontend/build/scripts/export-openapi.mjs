import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const repositoryDir = path.resolve(frontendDir, '..')
const configuredPython = process.env.BONEFREE_PYTHON
const localPythonCandidates = process.platform === 'win32'
  ? [path.join(repositoryDir, '.venv', 'Scripts', 'python.exe')]
  : [path.join(repositoryDir, '.venv', 'bin', 'python')]
const pythonCandidates = [
  ...(configuredPython ? [configuredPython] : []),
  ...localPythonCandidates.filter(existsSync),
  process.platform === 'win32' ? 'python' : 'python3',
]

for (const python of pythonCandidates) {
  const result = spawnSync(
    python,
    [
      path.join(repositoryDir, 'backend', 'scripts', 'export_openapi.py'),
      '--output',
      path.join(frontendDir, 'openapi', 'openapi.json'),
    ],
    { cwd: frontendDir, stdio: 'inherit' },
  )
  if (!result.error) process.exit(result.status ?? 1)
  if (result.error.code !== 'ENOENT') throw result.error
}

throw new Error(
  'Python was not found. Create the repository .venv or set BONEFREE_PYTHON.',
)
