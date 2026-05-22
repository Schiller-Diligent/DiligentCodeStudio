# Contributing to Diligent Code Studio

Thank you for helping improve Diligent Code Studio.

## Project principles

1. Security first
2. Local-first by default
3. No hidden telemetry
4. Practical workflows for Windows administrators and small software publishers
5. Clean UI over feature clutter

## Development workflow

1. Create a feature branch.
2. Keep changes focused.
3. Test on Windows before release-related changes.
4. Update README or ROADMAP when behavior changes.
5. Do not introduce telemetry or network calls without a documented reason and user-facing control.

## Code style

- TypeScript should remain strict.
- Rust commands should return clear error messages.
- Avoid broad filesystem access features until workspace trust controls are added.
