param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoPath 'desktop\publish\win-x64' }
Push-Location -LiteralPath $repoPath
try {
    npm run build:desktop
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    dotnet publish desktop/Yohaku.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $OutputDirectory --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Desktop publish failed.' }
    Copy-Item -LiteralPath (Join-Path $repoPath 'desktop\README.md') -Destination (Join-Path $OutputDirectory 'はじめに.md')
    Write-Output "Published to $OutputDirectory"
} finally { Pop-Location }
