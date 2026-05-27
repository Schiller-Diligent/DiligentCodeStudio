# Diligent Code Studio v0.5.0 UI + Workflow Upgrade

This build is a larger product-direction upgrade rather than a small patch.

## Major upgrades

- Professional application shell with top status/app bar.
- Workspace Menu remains in its own top space and does not horizontally scroll.
- Workspace Menu buttons still support drag-and-drop ordering.
- Reset Menu Order remains in Settings only.
- Global AI Assistant panel is docked on the right and available across pages.
- Bottom workbench adds Terminal, Problems, Output, Build Log, and AI Log tabs.
- Setup is now labeled Setup & Dependencies.
- Registry is now labeled Tool Registry.
- Project / Tools is now labeled Project Health Dashboard.

## Validation

Validated from source with:

```powershell
npm ci
npm run build
```

The frontend build completed successfully. Tauri executable packaging still requires Rust/Cargo and platform build tools on the local machine or GitHub Actions runner.
