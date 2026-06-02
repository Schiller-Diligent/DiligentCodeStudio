import { useEffect, useMemo, useState } from 'react';
import './AiProviderHubPanel.css';
import {
  DEFAULT_AI_PROVIDER_PROFILES,
  type AiProviderKind,
  type AiProviderProfile,
  cloneProviderWithoutSecret,
  createProviderId,
  listAiProviderModels,
  maskApiKey,
  testAiProviderConnection,
  validateProviderProfile,
} from './aiProviderHub';

const PROVIDER_STORAGE_KEY = 'diligent-code-studio.ai-provider-hub.profiles.v1';
const ACTIVE_PROVIDER_STORAGE_KEY = 'diligent-code-studio.ai-provider-hub.active-profile.v1';

type AiProviderHubPanelProps = {
  open: boolean;
  onClose: () => void;
};

function nowIso(): string {
  return new Date().toISOString();
}

function withTimestamps(profile: AiProviderProfile): AiProviderProfile {
  const now = nowIso();
  return {
    ...profile,
    createdAt: profile.createdAt || now,
    updatedAt: now,
    apiKey: undefined,
  };
}

function defaultProfiles(): AiProviderProfile[] {
  return DEFAULT_AI_PROVIDER_PROFILES.map((profile) => withTimestamps(profile));
}

function loadProfiles(): AiProviderProfile[] {
  try {
    const raw = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return defaultProfiles();

    const parsed = JSON.parse(raw) as AiProviderProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultProfiles();

    return parsed.map((profile) => ({
      ...profile,
      apiKey: undefined,
      temperature: Number.isFinite(profile.temperature) ? profile.temperature : 0.2,
      maxTokens: Number.isFinite(profile.maxTokens) ? profile.maxTokens : 1200,
      streaming: Boolean(profile.streaming),
      enabled: profile.enabled !== false,
      createdAt: profile.createdAt || nowIso(),
      updatedAt: profile.updatedAt || nowIso(),
    }));
  } catch {
    return defaultProfiles();
  }
}

function saveProfiles(profiles: AiProviderProfile[]): void {
  const safeProfiles = profiles.map(cloneProviderWithoutSecret).map((profile) => ({
    ...profile,
    apiKey: undefined,
  }));
  window.localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(safeProfiles));
}

function loadActiveProfileId(profiles: AiProviderProfile[]): string {
  const stored = window.localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY);
  if (stored && profiles.some((profile) => profile.id === stored)) return stored;
  return profiles[0]?.id ?? '';
}

function providerKindLabel(kind: AiProviderKind): string {
  switch (kind) {
    case 'openai-compatible': return 'OpenAI-Compatible';
    case 'ollama': return 'Ollama Local';
    case 'anthropic': return 'Anthropic';
    case 'gemini': return 'Gemini';
    case 'custom': return 'Custom';
    default: return kind;
  }
}

export default function AiProviderHubPanel({ open, onClose }: AiProviderHubPanelProps) {
  const initialProfiles = useMemo(() => loadProfiles(), []);
  const [profiles, setProfiles] = useState<AiProviderProfile[]>(initialProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId(initialProfiles));
  const [sessionApiKeys, setSessionApiKeys] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('AI Provider Hub ready.');
  const [busy, setBusy] = useState(false);
  const [modelResults, setModelResults] = useState<string[]>([]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId],
  );

  useEffect(() => {
    saveProfiles(profiles);
  }, [profiles]);

  useEffect(() => {
    if (activeProfileId) {
      window.localStorage.setItem(ACTIVE_PROVIDER_STORAGE_KEY, activeProfileId);
    }
  }, [activeProfileId]);

  if (!open) return null;

  function updateActiveProfile(patch: Partial<AiProviderProfile>) {
    if (!activeProfile) return;
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === activeProfile.id ? { ...profile, ...patch, updatedAt: nowIso() } : profile,
      ),
    );
  }

  function activeProfileWithSessionKey(): AiProviderProfile | null {
    if (!activeProfile) return null;
    return { ...activeProfile, apiKey: sessionApiKeys[activeProfile.id] || undefined };
  }

  function addProvider() {
    const newProfile = withTimestamps({
      id: createProviderId('Custom AI Provider'),
      name: 'Custom AI Provider',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      temperature: 0.2,
      maxTokens: 1200,
      streaming: false,
      enabled: true,
      createdAt: '',
      updatedAt: '',
    });

    setProfiles((current) => [...current, newProfile]);
    setActiveProfileId(newProfile.id);
    setModelResults([]);
    setStatus('New provider profile added.');
  }

  function deleteActiveProvider() {
    if (!activeProfile) return;

    const confirmed = window.confirm(`Delete AI provider profile "${activeProfile.name}"? API keys are not stored by this panel.`);
    if (!confirmed) return;

    setProfiles((current) => {
      const remaining = current.filter((profile) => profile.id !== activeProfile.id);
      const next = remaining.length > 0 ? remaining : defaultProfiles();
      setActiveProfileId(next[0]?.id ?? '');
      return next;
    });

    setSessionApiKeys((current) => {
      const next = { ...current };
      delete next[activeProfile.id];
      return next;
    });

    setModelResults([]);
    setStatus('Provider profile deleted.');
  }

  async function testConnection() {
    const profile = activeProfileWithSessionKey();
    if (!profile) {
      setStatus('No active provider profile selected.');
      return;
    }

    const validation = validateProviderProfile(profile);
    if (!validation.ok) {
      setStatus(`Cannot test provider: ${validation.errors.join(' ')}`);
      return;
    }

    setBusy(true);
    setStatus(`Testing ${profile.name}...`);

    try {
      const result = await testAiProviderConnection(profile);
      setStatus(`Connection test passed. Response: ${result.text || '(empty response)'}`);
    } catch (error) {
      setStatus(`Connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function discoverModels() {
    const profile = activeProfileWithSessionKey();
    if (!profile) {
      setStatus('No active provider profile selected.');
      return;
    }

    setBusy(true);
    setStatus(`Discovering models for ${profile.name}...`);
    setModelResults([]);

    try {
      const models = await listAiProviderModels(profile);
      setModelResults(models);
      setStatus(models.length > 0 ? `Discovered ${models.length} model(s).` : 'Model discovery succeeded but no models were returned.');
    } catch (error) {
      setStatus(`Model discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const validation = activeProfile ? validateProviderProfile(activeProfileWithSessionKey() ?? activeProfile) : null;
  const sessionApiKey = activeProfile ? sessionApiKeys[activeProfile.id] ?? '' : '';

  return (
    <section className="ai-provider-hub-overlay" role="dialog" aria-modal="true" aria-label="AI Provider Hub">
      <div className="ai-provider-hub-dialog">
        <header className="ai-provider-hub-header">
          <div>
            <p className="ai-provider-hub-eyebrow">v0.8.0 foundation</p>
            <h2>AI Provider Hub</h2>
            <p>Connect Diligent Code Studio to local or online AI providers using provider profiles.</p>
          </div>
          <button className="ai-provider-hub-close" type="button" onClick={onClose} aria-label="Close AI Provider Hub">Ã—</button>
        </header>

        <div className="ai-provider-hub-layout">
          <aside className="ai-provider-hub-sidebar">
            <div className="ai-provider-hub-sidebar-title">Provider Profiles</div>
            <div className="ai-provider-hub-profile-list">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={profile.id === activeProfile?.id ? 'active' : ''}
                  onClick={() => {
                    setActiveProfileId(profile.id);
                    setModelResults([]);
                    setStatus(`${profile.name} selected.`);
                  }}
                >
                  <strong>{profile.name}</strong>
                  <span>{providerKindLabel(profile.kind)} â€¢ {profile.model || 'No model'}</span>
                </button>
              ))}
            </div>
            <button className="ai-provider-hub-secondary" type="button" onClick={addProvider}>Add Provider</button>
          </aside>

          <main className="ai-provider-hub-main">
            {activeProfile ? (
              <>
                <div className="ai-provider-hub-form-grid">
                  <label>
                    Provider Name
                    <input value={activeProfile.name} onChange={(event) => updateActiveProfile({ name: event.target.value })} />
                  </label>

                  <label>
                    Provider Type
                    <select
                      value={activeProfile.kind}
                      onChange={(event) => {
                        const kind = event.target.value as AiProviderKind;
                        const baseUrl = kind === 'ollama'
                          ? 'http://localhost:11434'
                          : kind === 'openai-compatible'
                            ? 'http://localhost:1234/v1'
                            : activeProfile.baseUrl;
                        updateActiveProfile({ kind, baseUrl });
                      }}
                    >
                      <option value="openai-compatible">OpenAI-Compatible</option>
                      <option value="ollama">Ollama Local</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Gemini</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>

                  <label className="wide">
                    Base URL
                    <input value={activeProfile.baseUrl} onChange={(event) => updateActiveProfile({ baseUrl: event.target.value })} placeholder="http://localhost:1234/v1" spellCheck={false} />
                  </label>

                  <label>
                    Model
                    <input value={activeProfile.model} onChange={(event) => updateActiveProfile({ model: event.target.value })} placeholder="llama3.2, gpt-4o-mini, local-model" spellCheck={false} />
                  </label>

                  <label>
                    API Key
                    <input
                      type="password"
                      value={sessionApiKey}
                      onChange={(event) => setSessionApiKeys((current) => ({ ...current, [activeProfile.id]: event.target.value }))}
                      placeholder="Optional for local providers"
                      spellCheck={false}
                    />
                    <span className="ai-provider-hub-help">Session only. Saved profile stores {maskApiKey(activeProfile.apiKey) || 'no key'}.</span>
                  </label>

                  <label>
                    Temperature
                    <input type="number" min="0" max="2" step="0.1" value={activeProfile.temperature} onChange={(event) => updateActiveProfile({ temperature: Number(event.target.value) })} />
                  </label>

                  <label>
                    Max Tokens
                    <input type="number" min="1" step="100" value={activeProfile.maxTokens} onChange={(event) => updateActiveProfile({ maxTokens: Number(event.target.value) })} />
                  </label>

                  <label className="ai-provider-hub-checkbox">
                    <input type="checkbox" checked={activeProfile.streaming} onChange={(event) => updateActiveProfile({ streaming: event.target.checked })} />
                    Streaming enabled
                  </label>

                  <label className="ai-provider-hub-checkbox">
                    <input type="checkbox" checked={activeProfile.enabled} onChange={(event) => updateActiveProfile({ enabled: event.target.checked })} />
                    Provider enabled
                  </label>
                </div>

                <div className="ai-provider-hub-actions">
                  <button type="button" onClick={testConnection} disabled={busy}>Test Connection</button>
                  <button type="button" onClick={discoverModels} disabled={busy}>Discover Models</button>
                  <button type="button" className="danger" onClick={deleteActiveProvider} disabled={busy}>Delete Provider</button>
                </div>

                {validation && (
                  <div className={`ai-provider-hub-validation ${validation.ok ? 'ok' : 'error'}`}>
                    <strong>{validation.ok ? 'Profile looks usable.' : 'Profile needs attention.'}</strong>
                    {validation.errors.length > 0 && <ul>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
                    {validation.warnings.length > 0 && <ul>{validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </div>
                )}

                <div className="ai-provider-hub-status">
                  <strong>Status</strong>
                  <p>{status}</p>
                </div>

                {modelResults.length > 0 && (
                  <div className="ai-provider-hub-models">
                    <strong>Discovered Models</strong>
                    <div>
                      {modelResults.slice(0, 60).map((model) => (
                        <button key={model} type="button" onClick={() => updateActiveProfile({ model })}>{model}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ai-provider-hub-security-note">
                  <strong>Security note:</strong> API keys entered here are used for the current session only. They are not written to saved provider profiles. Review project context before sending it to any online provider.
                </div>
              </>
            ) : (
              <p>No AI provider profile is selected.</p>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}