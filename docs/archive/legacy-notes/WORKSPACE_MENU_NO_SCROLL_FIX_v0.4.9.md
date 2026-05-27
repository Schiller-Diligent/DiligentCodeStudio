# Diligent Code Studio v0.4.9 — Workspace Menu No-Scroll Fix

This update moves the Workspace Menu into its own fixed top toolbar area.

## Fixed

- The Workspace Menu no longer uses horizontal scrolling.
- Workspace Menu buttons now wrap naturally into the dedicated top menu area.
- The menu stays above the page content instead of being squeezed into the same row as file actions.
- Drag-and-drop ordering remains active on the Workspace Menu buttons.
- The Reset Menu Order button remains in Settings only.
- Responsive rules were updated so the Workspace Menu labels remain visible instead of collapsing into icon-only buttons.

## Validation

Validated with:

```powershell
npm ci
npm run build
```

Both commands completed successfully.
