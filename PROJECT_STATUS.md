# Plot Flow 1.0.0

Scope approved: restore the existing Handy-derived Plot Flow, retain the approved logo/Bilbo/#96a36c design; only GigaAM v3 E2E-CTC Q8_0; bundle model and native runtimes; no model picker or experimental UI; default history limit 5; Plot Flow recording/log/application names. Other audio/output/advanced settings remain unchanged. User requested continuous implementation, checks and GitHub publication.

Sources: saved Handy-main.zip (0.9.6 base), existing Plot Flow 0.9.7 binaries as behaviour reference, preserved generated logo/Bilbo PNGs and shortcut ICO. The separate Whisper-based 0.1.0 project is excluded.

Model: handy-computer/gigaam-v3-e2e-ctc-gguf revision 075dff81f843cf23d22b4ce943ffdc4dd8650cd7, Q8_0, 272151136 bytes, SHA256 9ccce4750dc813a493d96ca15ee251712bedec15ac9a02fa3d2bd732f08ae5eb. Model bytes excluded from Git; included in installer after checksum verification.

Competencies: skill-maksa, planner, Rust/React patterns, systematic-debugging, deployment patterns. Independent code review and Windows runtime checks required before release. Preserve upstream copyright/license notices.

Status: implementation and local verification complete; publication pending. GitHub repository created without description: wedding-postcards/Plot-Flow. Earlier missing-DLL guesses are not accepted as verified root cause.

Checks: 280 Rust tests passed; frontend lint, TypeScript/Vite build and bundled-model lifecycle tests passed; Clippy completed without errors (inherited warnings remain). Independent code review findings addressed: journalled safe recording migration, nonfatal migration errors, preserved ordinary audio/output controls. Fixed native GUI status RPC state type to match the registered Arc<TranscriptionManager>.

Final installer tested in a new empty portable folder: installer exit 0; exact model checksum and native DLL loading with DLL-directory/System32-only lookup passed; CLI with Windows-only PATH reported one installed GigaAM model and transcribed synthetic Russian speech exactly on CPU (879 ms inference, 289 ms model load). GPU inference also passed on this machine in the preceding release build. GUI General, History and Advanced opened; no false model-error banner; fresh history limit 5, experiments and upstream update checks disabled. Approved logo, Bilbo and ground are retained.

Limits: tests ran on the development PC with a fresh install directory and isolated DLL lookup, not a clean Windows VM or the partner's PC. No claim of universal hardware compatibility. Model and native runtime binaries go into the installer, not Git; recordings, settings and secrets are excluded from publication.
