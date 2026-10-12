$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
& "$PSScriptRoot/prepare-model.ps1"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio C++ Build Tools are required to build Plot Flow.' }
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$redist = Get-ChildItem (Join-Path $visualStudio 'VC/Redist/MSVC') -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'x64/Microsoft.VC143.CRT' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $redist) { throw 'The redistributable C++ runtime is missing from Visual Studio.' }
$openmp = Join-Path (Split-Path $redist) 'Microsoft.VC143.OpenMP'
$env:HANDY_VC_REDIST_DIRS = if (Test-Path -LiteralPath $openmp) { "$redist;$openmp" } else { $redist }
if (-not $env:VULKAN_SDK) {
    $sdk = Get-ChildItem 'C:/VulkanSDK' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($sdk) { $env:VULKAN_SDK = $sdk.FullName }
}
& npm run tauri -- build --config src-tauri/tauri.windows.conf.json
if ($LASTEXITCODE -ne 0) { throw "Plot Flow build failed ($LASTEXITCODE)." }
$staged = Join-Path $projectRoot 'src-tauri/transcribe-libs'
foreach ($name in @('transcribe.dll','ggml.dll','ggml-base.dll','msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll')) {
    if (-not (Test-Path -LiteralPath (Join-Path $staged $name))) { throw "Required runtime was not staged: $name" }
}
Write-Output 'Plot Flow Windows installer built with model and native runtimes.'
