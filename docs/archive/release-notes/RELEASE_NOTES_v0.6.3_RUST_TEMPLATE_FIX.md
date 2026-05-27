# Diligent Code Studio v0.6.3 - Rust Template Build Fix

Version 0.6.3 fixes a Rust build failure introduced in the Web Builder static website template generator.

## Fixed

- Corrected the static website HTML template in `src-tauri/src/main.rs` so Rust no longer misinterprets HTML attributes such as `href="#content"` and `class="site-grid"` as invalid Rust prefixes.
- Changed the affected template literal from a one-hash Rust raw string to a two-hash raw string so embedded `"#` sequences are handled safely.
- Synced package, Tauri, Cargo, visible app text, and manual version references to 0.6.3.

## Notes

This was a source-generation bug, not a problem with your Rust installation. The previous v0.6.2 package could pass the frontend build but fail during `npm run tauri:build` because the error lived in the Tauri/Rust source.
