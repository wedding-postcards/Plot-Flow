param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $InstallDirectory).Path
foreach ($name in @('plot-flow.exe','transcribe.dll','ggml.dll','ggml-base.dll','msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll','resources/models/silero_vad_v4.onnx','resources/models/gigaam-v3-e2e-ctc-Q8_0.gguf','resources/plot-flow-shortcut.ico')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $name))) { throw "Missing packaged file: $name" }
}
$model = Join-Path $root 'resources/models/gigaam-v3-e2e-ctc-Q8_0.gguf'
if ((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9ccce4750dc813a493d96ca15ee251712bedec15ac9a02fa3d2bd732f08ae5eb') {
    throw 'Installed model is corrupt.'
}
if (-not ('PlotFlowNativeProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PlotFlowNativeProbe {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
}
'@
}
foreach ($name in @('transcribe.dll','ggml.dll','ggml-base.dll','ggml-cpu-x64.dll')) {
    $path = Join-Path $root $name
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing native library: $name" }
    # DLL directory + System32 only: no PATH or development-tool DLL lookup.
    $handle = [PlotFlowNativeProbe]::LoadLibraryEx($path, [IntPtr]::Zero, 0x900)
    if ($handle -eq [IntPtr]::Zero) {
        $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Native dependency load failed for $name (Windows error $code)."
    }
    # Keep modules loaded until process exit. GGML installs a C++ terminate
    # handler; unloading and reloading it in a diagnostic host is unsafe.
}
Write-Output 'Installed model and native dependency loading verified.'
