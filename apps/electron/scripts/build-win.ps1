$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "../../..")

Push-Location $RootDir
try {
    bun install --frozen-lockfile
    bun run electron:build
    Push-Location "apps/electron"
    try {
        bunx electron-builder --config electron-builder.yml --win --x64
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}
