# Diligent Code Studio v0.6.1 - Cumulative Manual Policy

## Purpose

This release changes how the built-in PDF user manual is maintained.

The manual should no longer be rewritten as a new short manual each release. Instead, it is treated as a cumulative living document:

- The original v0.5.5 manual pages remain at the beginning.
- New releases add appendices/addendum pages after the original manual.
- The app opens a stable manual path: `public/manuals/DiligentCodeStudio_UserManual.pdf`.
- Versioned manual archives are kept under `docs/manuals/`.

## Files added

- `public/manuals/DiligentCodeStudio_UserManual.pdf`
- `public/manuals/DiligentCodeStudio_UserManual_v0.6.1_Cumulative.pdf`
- `docs/DiligentCodeStudio_UserManual.pdf`
- `docs/DiligentCodeStudio_UserManual_v0.6.1_Cumulative.pdf`
- `docs/manuals/DiligentCodeStudio_UserManual_v0.5.5_Original.pdf`
- `docs/manuals/DiligentCodeStudio_UserManual_v0.6.1_Addendum.pdf`
- `docs/manuals/DiligentCodeStudio_UserManual_v0.6.1_Cumulative.pdf`

## App behavior

- The top-right Manual button now opens the stable cumulative manual file.
- Future releases should append to the manual instead of replacing the beginning.

## Version sync

Synced visible UI, package, Tauri, Cargo, and manual references to v0.6.1.
