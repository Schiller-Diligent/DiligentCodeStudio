export type AiProviderKind =
  | 'openai-compatible'
  | 'ollama'
  | 'anthropic'
  | 'gemini'
  | 'custom';

export type AiMessageRole = 'system' | 'user' | 'assistant';

export type AiProviderProfile = {
  id: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiChatMessage = {
  role: AiMessageRole;
  content: string;
};

export type AiProviderValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type AiProviderRequest = {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  providerKind: AiProviderKind;
};

export type AiProviderResponse = {
  text: string;
  raw: unknown;
};

export const AI_PROVIDER_HUB_VERSION = '0.8.0-foundation';

export const DEFAULT_AI_PROVIDER_PROFILES: AiProviderProfile[] = [
  {
    id: 'openai-compatible-default',
    name: 'OpenAI-Compatible API',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 1200,
    streaming: false,
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'ollama-local',
    name: 'Ollama Local',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2',
    temperature: 0.2,
    maxTokens: 1200,
    streaming: false,
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'lm-studio-local',
    name: 'LM Studio Local',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    temperature: 0.2,
    maxTokens: 1200,
    streaming: false,
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'custom-ai-endpoint',
    name: 'Custom AI Endpoint',
    kind: 'custom',
    baseUrl: '',
    model: '',
    temperature: 0.2,
    maxTokens: 1200,
    streaming: false,
    enabled: false,
    createdAt: '',
    updatedAt: '',
  },
];

export function createProviderId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${normalized || 'ai-provider'}-${suffix}`;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/g, '');
}

export function maskApiKey(apiKey?: string): string {
  if (!apiKey) return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return 'â€¢â€¢â€¢â€¢';
  return `${trimmed.slice(0, 4)}â€¢â€¢â€¢â€¢${trimmed.slice(-4)}`;
}

export function cloneProviderWithoutSecret(profile: AiProviderProfile): AiProviderProfile {
  const copy: AiProviderProfile = { ...profile };
  if (copy.apiKey) copy.apiKey = maskApiKey(copy.apiKey);
  return copy;
}

export function validateProviderProfile(profile: AiProviderProfile): AiProviderValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = profile.name.trim();
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  const model = profile.model.trim();

  if (!name) errors.push('Provider name is required.');
  if (!profile.kind) errors.push('Provider type is required.');
  if (!baseUrl) errors.push('Base URL is required.');
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) errors.push('Base URL must start with http:// or https://.');
  if (!model) errors.push('Model name is required.');
  if (profile.temperature < 0 || profile.temperature > 2) warnings.push('Temperature is usually between 0 and 2.');
  if (profile.maxTokens < 1) errors.push('Max tokens must be greater than 0.');
  if (profile.maxTokens > 32000) warnings.push('Very high max token values may fail on smaller models.');

  if (profile.kind !== 'ollama' && baseUrl.startsWith('https://') && !profile.apiKey && profile.kind !== 'custom') {
    warnings.push('Online providers usually require an API key.');
  }

  if (profile.apiKey && profile.apiKey.trim().length < 8) warnings.push('The API key looks unusually short.');

  return { ok: errors.length === 0, errors, warnings };
}

export function getProviderChatEndpoint(profile: AiProviderProfile): string {
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  if (profile.kind === 'ollama') return `${baseUrl}/api/chat`;
  if (baseUrl.endsWith('/chat/completions')) return baseUrl;
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
}

export function getProviderModelsEndpoint(profile: AiProviderProfile): string {
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  if (profile.kind === 'ollama') return `${baseUrl}/api/tags`;
  if (baseUrl.endsWith('/models')) return baseUrl;
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/models`;
  return `${baseUrl}/v1/models`;
}

export function buildAiProviderRequest(profile: AiProviderProfile, messages: AiChatMessage[]): AiProviderRequest {
  const validation = validateProviderProfile(profile);
  if (!validation.ok) throw new Error(validation.errors.join(' '));

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (profile.apiKey?.trim()) headers.Authorization = `Bearer ${profile.apiKey.trim()}`;

  if (profile.kind === 'ollama') {
    return {
      url: getProviderChatEndpoint(profile),
      method: 'POST',
      headers,
      providerKind: profile.kind,
      body: JSON.stringify({
        model: profile.model.trim(),
        messages,
        stream: profile.streaming,
        options: {
          temperature: profile.temperature,
          num_predict: profile.maxTokens,
        },
      }),
    };
  }

  return {
    url: getProviderChatEndpoint(profile),
    method: 'POST',
    headers,
    providerKind: profile.kind,
    body: JSON.stringify({
      model: profile.model.trim(),
      messages,
      temperature: profile.temperature,
      max_tokens: profile.maxTokens,
      stream: profile.streaming,
    }),
  };
}

export function extractAiProviderText(kind: AiProviderKind, responseJson: unknown): AiProviderResponse {
  const raw = responseJson as Record<string, unknown>;

  if (kind === 'ollama') {
    const message = raw.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === 'string' ? message.content : '';
    return { text: content, raw: responseJson };
  }

  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';

  return { text: content, raw: responseJson };
}

export async function testAiProviderConnection(profile: AiProviderProfile): Promise<AiProviderResponse> {
  const request = buildAiProviderRequest(profile, [
    { role: 'system', content: 'You are testing an AI provider connection. Reply with a short success message.' },
    { role: 'user', content: 'Connection test. Reply with: connection ok' },
  ]);

  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Provider test failed with HTTP ${response.status}. ${errorText}`.trim());
  }

  const json = await response.json();
  return extractAiProviderText(profile.kind, json);
}

export async function listAiProviderModels(profile: AiProviderProfile): Promise<string[]> {
  const validation = validateProviderProfile({ ...profile, model: profile.model || 'model-placeholder' });
  const hardErrors = validation.errors.filter((error) => error !== 'Model name is required.');
  if (hardErrors.length > 0) throw new Error(hardErrors.join(' '));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (profile.apiKey?.trim()) headers.Authorization = `Bearer ${profile.apiKey.trim()}`;

  const response = await fetch(getProviderModelsEndpoint(profile), { method: 'GET', headers });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Model discovery failed with HTTP ${response.status}. ${errorText}`.trim());
  }

  const json = (await response.json()) as Record<string, unknown>;

  if (profile.kind === 'ollama') {
    const models = Array.isArray(json.models) ? json.models : [];
    return models
      .map((item) => (item as Record<string, unknown>).name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .sort();
  }

  const data = Array.isArray(json.data) ? json.data : [];
  return data
    .map((item) => (item as Record<string, unknown>).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
}

export function makeAiChatMessages(systemPrompt: string, userPrompt: string, context?: string): AiChatMessage[] {
  const messages: AiChatMessage[] = [];

  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  const userContent = context?.trim()
    ? `${userPrompt.trim()}\n\nContext:\n${context.trim()}`
    : userPrompt.trim();

  messages.push({ role: 'user', content: userContent });
  return messages;
}