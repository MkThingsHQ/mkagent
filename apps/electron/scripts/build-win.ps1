$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir "../../..")
$ElectronDir = Join-Path $RootDir "apps/electron"
$BunVersion = "bun-v1.3.9"
$UvVersion = "0.10.6"

Push-Location $RootDir
try {
    bun install --frozen-lockfile
    $BunDownload = "bun-windows-x64-baseline"
    $TempDir = Join-Path $env:TEMP "mkagent-runtime-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    try {
        Remove-Item -Recurse -Force "$ElectronDir/vendor/bun" -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Force -Path "$ElectronDir/vendor/bun" | Out-Null
        Invoke-WebRequest -Uri "https://github.com/oven-sh/bun/releases/download/$BunVersion/$BunDownload.zip" -OutFile "$TempDir/$BunDownload.zip"
        Invoke-WebRequest -Uri "https://github.com/oven-sh/bun/releases/download/$BunVersion/SHASUMS256.txt" -OutFile "$TempDir/SHASUMS256.txt"
        $ExpectedHash = (Get-Content "$TempDir/SHASUMS256.txt" | Select-String "$BunDownload.zip").ToString().Split(" ")[0]
        $ActualHash = (Get-FileHash "$TempDir/$BunDownload.zip" -Algorithm SHA256).Hash.ToLower()
        if ($ActualHash -ne $ExpectedHash) {
            throw "Bun checksum verification failed"
        }
        Expand-Archive -Path "$TempDir/$BunDownload.zip" -DestinationPath $TempDir -Force
        Copy-Item "$TempDir/$BunDownload/bun.exe" "$ElectronDir/vendor/bun/bun.exe"

        $UvDownload = "uv-x86_64-pc-windows-msvc.zip"
        $UvArchive = Join-Path $TempDir $UvDownload
        $UvChecksum = "$UvArchive.sha256"
        Invoke-WebRequest -Uri "https://github.com/astral-sh/uv/releases/download/$UvVersion/$UvDownload" -OutFile $UvArchive
        Invoke-WebRequest -Uri "https://github.com/astral-sh/uv/releases/download/$UvVersion/$UvDownload.sha256" -OutFile $UvChecksum
        $ExpectedUvHash = [regex]::Match((Get-Content $UvChecksum -Raw), '[a-fA-F0-9]{64}').Value.ToLower()
        $ActualUvHash = (Get-FileHash $UvArchive -Algorithm SHA256).Hash.ToLower()
        if ($ActualUvHash -ne $ExpectedUvHash) {
            throw "uv checksum verification failed"
        }
        $UvExtractDir = Join-Path $TempDir "uv"
        Expand-Archive -Path $UvArchive -DestinationPath $UvExtractDir -Force
        $UvSource = Get-ChildItem -Path $UvExtractDir -Filter "uv.exe" -Recurse | Select-Object -First 1
        $UvDir = Join-Path $ElectronDir "resources/bin/win32-x64"
        New-Item -ItemType Directory -Force -Path $UvDir | Out-Null
        Copy-Item $UvSource.FullName (Join-Path $UvDir "uv.exe")
    } finally {
        Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    }
    $env:MKAGENT_TARGET_PLATFORM = "win32"
    $env:MKAGENT_TARGET_ARCH = "x64"
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
