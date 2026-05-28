# Security Policy

Diligent Code Studio is intended to be a security-focused, local-first code editor.

## Reporting a vulnerability

Please report security issues privately before opening a public issue.

Include:

- Product version
- Operating system
- Reproduction steps
- Expected result
- Actual result
- Any logs or screenshots that help verify the issue

## Security principles

- No telemetry by default
- Clear user consent for network features
- Extension permissions before extension execution
- Workspace trust before script execution
- Built-in checksum generation for release artifacts


## v0.7.0-dev security foundation

- OpenAI API keys are session-only and are redacted before preferences are saved.
- `.aiignore` excludes common secret files, private keys, generated folders, and local databases from AI context workflows.
- `npm run test:security` scans source-controlled files for obvious hardcoded secrets before release.
- `run_terminal_command` now validates terminal command input for empty, oversized, null-character, and control-character payloads before shell execution.
- Rust unit tests cover child-name validation, terminal command validation, generated-folder skip rules, and npm command normalization.

Do not paste production secrets into prompts or commit them into project files. Prefer Ollama for private local code review when working with sensitive projects.
