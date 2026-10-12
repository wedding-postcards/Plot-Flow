param([string]$SourcePath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$filename = 'gigaam-v3-e2e-ctc-Q8_0.gguf'
$expectedHash = '9ccce4750dc813a493d96ca15ee251712bedec15ac9a02fa3d2bd732f08ae5eb'
$destination = Join-Path $projectRoot "src-tauri/resources/models/$filename"
if (-not (Test-Path -LiteralPath $destination)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    $temporary = "$destination.download"
    if ($SourcePath) {
        Copy-Item -LiteralPath $SourcePath -Destination $temporary
    } else {
        $url = "https://huggingface.co/handy-computer/gigaam-v3-e2e-ctc-gguf/resolve/075dff81f843cf23d22b4ce943ffdc4dd8650cd7/$filename"
        Invoke-WebRequest -Uri $url -OutFile $temporary
    }
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
        throw 'GigaAM checksum mismatch. Build cancelled.'
    }
    Move-Item -LiteralPath $temporary -Destination $destination
}
if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Bundled GigaAM checksum mismatch. Build cancelled.'
}
Write-Output 'GigaAM v3 E2E-CTC Q8_0 verified.'
