import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const result = Bun.spawnSync(
  [process.execPath, 'run', 'scripts/copy-assets.ts'],
  { cwd: join(root, 'apps', 'electron'), stdout: 'inherit', stderr: 'inherit' },
)

if (result.exitCode !== 0) process.exit(result.exitCode)
