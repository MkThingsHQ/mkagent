import { join } from 'node:path'
import { copyOpenConnectorRuntime, prepareOpenConnector } from './prepare-open-connector'

const root = join(import.meta.dir, '..')
await prepareOpenConnector()

const result = Bun.spawnSync(
  [process.execPath, 'run', 'scripts/copy-assets.ts'],
  { cwd: join(root, 'apps', 'electron'), stdout: 'inherit', stderr: 'inherit' },
)

if (result.exitCode !== 0) process.exit(result.exitCode)

copyOpenConnectorRuntime(join(root, 'apps', 'electron', 'dist', 'resources', 'open-connector'))
