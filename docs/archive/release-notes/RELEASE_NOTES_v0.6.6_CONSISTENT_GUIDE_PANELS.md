# Diligent Code Studio v0.6.6 - Consistent Guide Panels

## Summary

This release standardizes the **Guide Me / What this page does** area across workspace pages so the guidance panel no longer changes height or width from page to page.

## Changes

- Added a shared `guide-card-copy` layout wrapper.
- Standardized the guide panel desktop height to a consistent 122px.
- Added line-clamping for long page descriptions so they do not stretch the panel.
- Standardized the Guide Me action area width and alignment.
- Kept mobile and narrow-window behavior flexible so the panel can grow when needed.
- Updated visible app version labels to v0.6.6.
- Added a cumulative manual v0.6.6 addendum.

## Testing

Validated with:

```powershell
npm ci
npm run validate
npm run build
```
