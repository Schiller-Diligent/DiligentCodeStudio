# Open Source Credits

Diligent Code Studio is built with gratitude for the open-source community.

The in-app **Open Source Credits** page lists the major frameworks, libraries, tools, and supported ecosystems used by or integrated into the project. Each entry includes a website link that opens in the user's default browser.

This document and the in-app page are acknowledgments. They do not replace license review. Before public distribution, keep the exact dependency versions, license files, NOTICE file, package manifests, and third-party notices aligned with the released build.

## Included acknowledgment areas

- Frontend frameworks and build tools: React, React DOM, Vite, TypeScript
- Editor and UI components: Monaco Editor, @monaco-editor/react, Lucide
- Desktop application framework: Tauri, @tauri-apps/api, Tauri CLI
- Rust backend ecosystem: Rust, Cargo, Serde, serde_json, sha2, hex, rfd, reqwest, rustls
- Developer tools: Node.js, npm, Git, GitHub CLI
- Local AI: Ollama
- Web Builder tools: Tailwind CSS, Bootstrap, React Router, Framer Motion, Recharts
- Quality and deployment tools: ESLint, Prettier, Vercel CLI, Netlify CLI

## Maintenance checklist

When dependencies change:

1. Update the in-app `OPEN_SOURCE_CREDITS` list in `src/App.tsx`.
2. Update this document.
3. Review package licenses.
4. Update `NOTICE` or third-party notices if required.
5. Add a cumulative manual addendum for the release.
