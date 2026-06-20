# Diligent Code Studio v0.9.0 AI Provider Hub Foundation

The AI Provider Hub is the provider-neutral foundation for connecting Diligent Code Studio to local and online AI services.

## Phase 1 scope

This foundation adds:

- `src/aiProviderHub.ts`
- `scripts/ai-provider-hub-smoke-test.mjs`

It supports:

- OpenAI-compatible chat endpoints
- Ollama local chat endpoint structure
- LM Studio through OpenAI-compatible `/v1` endpoints
- Custom provider profile validation
- API key masking
- Model discovery endpoint builders
- Connection test request builders
- Unified chat message construction

## Provider strategy

The preferred integration path is OpenAI-compatible first because many local and online tools expose an OpenAI-style API.

Examples:

- `http://localhost:11434/v1`
- `http://localhost:1234/v1`
- `https://api.openai.com/v1`
- Custom compatible endpoints

## Security rules

- API keys must not be logged.
- API keys must not be committed.
- UI fields should mask API keys.
- Saved preferences should avoid plain secret persistence unless secure storage is added.
- AI context should be visible to users before sending.

## Next UI phase

The next patch should wire this module into the app UI:

1. Add AI Provider Hub panel.
2. Add provider profiles.
3. Add Test Connection.
4. Add Discover Models.
5. Route AI Help through the selected provider profile.
6. Add clear warnings around sending project context to providers.