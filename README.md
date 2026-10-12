# Plot Flow

Windows x64. Version 1.0.0. GigaAM v3 E2E-CTC Q8_0 is included in the installer.

[Download Windows installer](https://github.com/wedding-postcards/Plot-Flow/releases/latest).

Build requirements: Node.js, Rust MSVC toolchain, Visual Studio C++ Build Tools, CMake and Vulkan SDK.

Build: `npm ci`, then `powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1`.

The build script downloads the pinned model if absent and verifies its SHA256. Model files and user data are not committed. Installer output: `src-tauri/target/release/bundle/nsis/`.

Derived from Handy. Original copyright and MIT license are retained in `LICENSE`; bundled license notices are under `src-tauri/resources/licenses/`.
