# Diligent Code Studio v0.4.9 Workspace Menu Drag-and-Drop Fix

This package keeps the application version at v0.4.9 and fixes the top Workspace Menu ordering behavior.

## Fixed

- Replaced unreliable HTML5 drag/drop on toolbar buttons with pointer-based drag sorting.
- Drag a Workspace Menu button left or right, release over another button, and the order is saved to preferences.
- Drop on the left half of a button to place the dragged button before it.
- Drop on the right half of a button to place the dragged button after it.
- The Reset Menu Order button remains in Settings only and resets the toolbar to the default order.
- Templates remains the first/default far-left Workspace Menu item after reset.

## Validation

Validated with:

```powershell
npm ci
npm run build
```

The React/TypeScript/Vite frontend build completed successfully.
