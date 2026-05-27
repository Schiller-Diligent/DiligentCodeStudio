# Diligent Code Studio v0.5.7 - Version Sync Fix

This release corrects the visible version mismatch reported after the v0.5.6 project-aware AI package.

## Fixed
- Updated visible app version labels to v0.5.7.
- Updated package metadata to 0.5.7.
- Updated Tauri metadata to 0.5.7.
- Updated Rust/Cargo metadata to 0.5.7.
- Rebuilt the built-in PDF user manual as v0.5.7.
- Removed older manual PDFs from the packaged public/manuals and docs folders to prevent Help from opening an older manual.
- Confirmed the built dist output includes only `DiligentCodeStudio_UserManual_v0.5.7.pdf` for the in-app manual.

## Note
If Windows still opens an older version after installing this package, uninstall the previous Diligent Code Studio build first and verify the shortcut target points to the newly installed executable.
