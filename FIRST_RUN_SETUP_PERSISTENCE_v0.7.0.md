# First Run Setup Persistence - v0.7.0

This update turns the First Run Setup Wizard from a visual onboarding screen into a persistent application setup flow.

## What is saved

The wizard now saves these local preferences:

- Interface mode: Beginner or Advanced
- AI provider: Ollama, OpenAI, or Disabled
- Default workspace path
- First Run Setup completion status
- First Run Setup completion timestamp

## Important version rule

The visible development label may say `v0.7.0-dev`, but installer/package versions must remain numeric-only as `0.7.0` for MSI compatibility.

## Reset behavior

Settings now includes **Reset First Run Setup**. This reopens the wizard without deleting project files or clearing normal preferences.

## Storage

Preferences are stored locally using the existing Diligent Code Studio preferences storage. OpenAI API keys remain session-only and are not persisted.