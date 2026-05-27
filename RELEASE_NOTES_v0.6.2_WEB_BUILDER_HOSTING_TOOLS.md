# Diligent Code Studio v0.6.2 - Web Builder + Hosting Tools

## Overview

Version 0.6.2 adds a dedicated Web Builder workspace for creating, previewing, building, and preparing web projects for local or public hosting.

## Added

- New **Web Builder** workspace page.
- Local hosting actions for:
  - local development preview
  - LAN preview/testing
  - production build
  - production preview
- Global deployment command helpers for:
  - Vercel preview deploy
  - Vercel production deploy
  - Netlify preview deploy
  - Netlify production deploy
- Installable web component/tool buttons for:
  - React Router
  - Tailwind CSS
  - Bootstrap
  - Lucide Icons
  - Framer Motion
  - Recharts
  - ESLint + Prettier
  - Vercel CLI
  - Netlify CLI
- New project templates:
  - Static Website
  - React + Vite Website
- New Setup & Dependencies checks for:
  - Vercel CLI
  - Netlify CLI
  - pnpm
- New Tool Registry entries for web hosting and deployment workflows.

## Manual

The cumulative user manual remains stable at:

- `public/manuals/DiligentCodeStudio_UserManual.pdf`

The v0.6.2 addendum was appended to the existing manual rather than replacing the original manual content.

## Validation

Validated with:

```powershell
npm run validate
npm run build
```

Rust/Cargo validation must be run on a local development computer with Rust installed.
