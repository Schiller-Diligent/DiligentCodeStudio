import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe2,
  Hash,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  PackageCheck,
  Play,
  Rocket,
  RefreshCw,
  Save,
  SaveAll,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { languageFromPath, languageLabelFromId, languageLabelFromPath, registerDiligentLanguages, supportedLanguageGroups } from './editorLanguages';
import type { ActivityItem, DiagnosticProblem, DiagnosticRunResult, GitChangedFile, GitStatusInfo, OpenFile, ProjectInfo, ReleaseInfo, ReleasePackageResult, ProjectTemplate, ProjectTemplateResult, SearchResult, TerminalResult, ToolRegistryItem, ToolStatus, PlatformInfo, WorkspaceEntry, AiChatResponse, OllamaModelInfo, OllamaStatusInfo, SetupDependency } from './types';

function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isDescendantOf(relativePath: string, collapsedDirectory: string): boolean {
  return relativePath.startsWith(`${collapsedDirectory}\\`) || relativePath.startsWith(`${collapsedDirectory}/`);
}

function visibleEntries(
  entries: WorkspaceEntry[],
  collapsedDirectories: Set<string>,
  filterText: string,
): WorkspaceEntry[] {
  const filter = filterText.trim().toLowerCase();

  if (filter.length > 0) {
    return entries.filter((entry) =>
      entry.name.toLowerCase().includes(filter) ||
      entry.relative_path.toLowerCase().includes(filter),
    );
  }

  return entries.filter((entry) => {
    for (const collapsed of collapsedDirectories) {
      if (isDescendantOf(entry.relative_path, collapsed)) return false;
    }
    return true;
  });
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function dirname(path: string): string {
  const slash = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (slash <= 0) return path;
  return path.slice(0, slash);
}

function isSameOrChildPath(path: string, parentPath: string): boolean {
  const left = path.replace(/\\/g, '/').toLowerCase();
  const right = parentPath.replace(/\\/g, '/').toLowerCase();
  return left === right || left.startsWith(`${right}/`);
}

function formatTerminalResult(result: TerminalResult): string {
  const lines = [
    `[${nowStamp()}] Command completed`,
    `Working directory: ${result.cwd}`,
    `Command: ${result.command}`,
    result.stdout.trimEnd() ? `--- stdout ---\n${result.stdout.trimEnd()}` : '',
    result.stderr.trimEnd() ? `--- stderr ---\n${result.stderr.trimEnd()}` : '',
    `Exit Code: ${result.exit_code}`,
    `Status: ${result.success ? 'Success' : 'Failed'}`,
  ].filter(Boolean);

  return `${lines.join('\n')}\n`;
}

function verboseCommandHeader(label: string, cwd: string, command: string, shell?: string): string {
  return [
    '',
    `[${nowStamp()}] ${label}`,
    `Working directory: ${cwd || 'Not selected'}`,
    `Shell: ${shell && shell !== 'auto' ? shell : 'Auto / OS Default'}`,
    `Command: ${command}`,
    'Status: started...',
  ].join('\n') + '\n';
}

function elapsedSeconds(startedAt: number): number {
  return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
}

type QuickCommand = {
  label: string;
  command: string;
  className?: string;
};

type WorkspacePage = 'templates' | 'start' | 'web' | 'setup' | 'editor' | 'ai' | 'findsearch' | 'terminal' | 'git' | 'problems' | 'release' | 'registry' | 'project' | 'logs' | 'credits' | 'settings';
type BottomPanelTab = 'terminal' | 'problems' | 'output' | 'build' | 'aiLog';
type MenuDropPlacement = 'before' | 'after';

type ThemePreference = 'dark' | 'midnight' | 'light';
type TerminalShellPreference = 'auto' | 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'zsh';
type InterfaceModePreference = 'beginner' | 'advanced';
type AiProviderPreference = 'disabled' | 'openai' | 'ollama';
type AiContextPreference = 'selection' | 'currentFile' | 'project' | 'problems' | 'terminal' | 'git';

type AppPreferences = {
  theme: ThemePreference;
  editorFontSize: number;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveDelaySeconds: number;
  defaultWorkspacePath: string;
  rememberLastWorkspace: boolean;
  openWorkspaceOnStartup: boolean;
  lastWorkspacePath: string;
  rememberLastActivePage: boolean;
  lastActivePage: WorkspacePage;
  rememberExpandedFolders: boolean;
  terminalShell: TerminalShellPreference;
  aiProvider: AiProviderPreference;
  aiOpenAiApiKey: string;
  aiOpenAiModel: string;
  aiOllamaEndpoint: string;
  aiOllamaModel: string;
  aiRequireConfirmation: boolean;
  aiDefaultContext: AiContextPreference;
  compactMode: boolean;
  interfaceMode: InterfaceModePreference;
  menuPageOrder: WorkspacePage[];
  firstRunSetupCompleted: boolean;
  firstRunSetupCompletedAt: string;
};

const PREFERENCES_STORAGE_KEY = 'diligent-code-studio.preferences.v1';
const ONBOARDING_STORAGE_KEY = 'diligent-code-studio.onboarding.v1';
const AI_HELP_POSITION_STORAGE_KEY = 'diligent-code-studio.ai-help-position.v1';
const USER_MANUAL_PATH = '/manuals/DiligentCodeStudio_UserManual.pdf';

type FloatingPanelPosition = {
  left: number;
  top: number;
};

function defaultAiHelpPosition(): FloatingPanelPosition {
  if (typeof window === 'undefined') return { left: 900, top: 72 };
  return {
    left: Math.max(16, window.innerWidth - 396),
    top: 72,
  };
}

function clampFloatingPanelPosition(position: FloatingPanelPosition, width = 380, height = 460): FloatingPanelPosition {
  if (typeof window === 'undefined') return position;
  const margin = 12;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(position.left, margin), maxLeft),
    top: Math.min(Math.max(position.top, margin), maxTop),
  };
}

function loadAiHelpPosition(): FloatingPanelPosition {
  try {
    const raw = window.localStorage.getItem(AI_HELP_POSITION_STORAGE_KEY);
    if (!raw) return defaultAiHelpPosition();
    const parsed = JSON.parse(raw) as Partial<FloatingPanelPosition>;
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return defaultAiHelpPosition();
    return clampFloatingPanelPosition({ left: parsed.left, top: parsed.top });
  } catch {
    return defaultAiHelpPosition();
  }
}

function saveAiHelpPosition(position: FloatingPanelPosition): void {
  try {
    window.localStorage.setItem(AI_HELP_POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Position persistence is convenience-only. Ignore storage failures.
  }
}

const DEFAULT_PAGE_ORDER: WorkspacePage[] = [
  'templates',
  'start',
  'web',
  'editor',
  'ai',
  'findsearch',
  'terminal',
  'git',
  'problems',
  'release',
  'registry',
  'project',
  'logs',
  'credits',
  'settings',
];

function workspacePageLabel(page: WorkspacePage): string {
  switch (page) {
    case 'editor': return 'Editor';
    case 'ai': return 'AI';
    case 'findsearch': return 'Find/Search';
    case 'terminal': return 'Terminal';
    case 'git': return 'Git';
    case 'problems': return 'Problems';
    case 'release': return 'Release';
    case 'templates': return 'Templates';
    case 'start': return 'Start Here';
    case 'web': return 'Web Builder';
    case 'setup': return 'Setup & Dependencies';
    case 'registry': return 'Tool Registry';
    case 'project': return 'Project Dashboard';
    case 'logs': return 'Logs';
    case 'credits': return 'Open Source Credits';
    case 'settings': return 'Settings';
    default: return String(page);
  }
}

function normalizePageOrder(value: unknown): WorkspacePage[] {
  const requested = Array.isArray(value) ? value : [];
  const ordered: WorkspacePage[] = [];

  for (const item of requested) {
    // Setup & Dependencies remains available from the top-right Setup button,
    // but it is intentionally excluded from the main Workspace Menu to save room.
    if (item === 'setup') continue;
    if (isWorkspacePage(item) && !ordered.includes(item)) {
      ordered.push(item);
    }
  }

  for (const page of DEFAULT_PAGE_ORDER) {
    if (!ordered.includes(page)) {
      ordered.push(page);
    }
  }

  return ordered;
}

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  editorFontSize: 14,
  wordWrap: false,
  autoSave: false,
  autoSaveDelaySeconds: 3,
  defaultWorkspacePath: 'C:\\DiligentProjects',
  rememberLastWorkspace: true,
  openWorkspaceOnStartup: false,
  lastWorkspacePath: 'C:\\DiligentProjects',
  rememberLastActivePage: true,
  lastActivePage: 'start',
  rememberExpandedFolders: true,
  terminalShell: 'auto',
  aiProvider: 'disabled',
  aiOpenAiApiKey: '',
  aiOpenAiModel: 'gpt-4.1-mini',
  aiOllamaEndpoint: 'http://127.0.0.1:11434',
  aiOllamaModel: 'codellama',
  aiRequireConfirmation: true,
  aiDefaultContext: 'selection',
  compactMode: false,
  interfaceMode: 'beginner',
  menuPageOrder: DEFAULT_PAGE_ORDER,
  firstRunSetupCompleted: false,
  firstRunSetupCompletedAt: '',
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeWorkspacePage(value: unknown): WorkspacePage {
  const page = String(value);
  if (page === 'find' || page === 'search' || page === 'findsearch') return 'findsearch';
  if (['editor', 'ai', 'terminal', 'git', 'problems', 'release', 'templates', 'start', 'web', 'setup', 'registry', 'project', 'logs', 'credits', 'settings'].includes(page)) return page as WorkspacePage;
  return DEFAULT_PREFERENCES.lastActivePage;
}

function isWorkspacePage(value: unknown): value is WorkspacePage {
  return ['editor', 'ai', 'findsearch', 'terminal', 'git', 'problems', 'release', 'templates', 'start', 'web', 'setup', 'registry', 'project', 'logs', 'credits', 'settings'].includes(String(value));
}

function loadPreferences(): AppPreferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    const theme = ['dark', 'midnight', 'light'].includes(String(parsed.theme)) ? parsed.theme as ThemePreference : DEFAULT_PREFERENCES.theme;
    const terminalShell = ['auto', 'powershell', 'pwsh', 'cmd', 'bash', 'zsh'].includes(String(parsed.terminalShell)) ? parsed.terminalShell as TerminalShellPreference : DEFAULT_PREFERENCES.terminalShell;
    const aiProvider = ['disabled', 'openai', 'ollama'].includes(String(parsed.aiProvider)) ? parsed.aiProvider as AiProviderPreference : DEFAULT_PREFERENCES.aiProvider;
    const aiDefaultContext = ['selection', 'currentFile', 'project', 'problems', 'terminal', 'git'].includes(String(parsed.aiDefaultContext)) ? parsed.aiDefaultContext as AiContextPreference : DEFAULT_PREFERENCES.aiDefaultContext;
    const interfaceMode = ['beginner', 'advanced'].includes(String((parsed as Partial<AppPreferences>).interfaceMode)) ? (parsed as Partial<AppPreferences>).interfaceMode as InterfaceModePreference : DEFAULT_PREFERENCES.interfaceMode;
    const menuPageOrder = normalizePageOrder(parsed.menuPageOrder);

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      theme,
      terminalShell,
      aiProvider,
      aiDefaultContext,
      interfaceMode,
      menuPageOrder,
      firstRunSetupCompleted: parsed.firstRunSetupCompleted === true,
      firstRunSetupCompletedAt: typeof parsed.firstRunSetupCompletedAt === 'string' ? parsed.firstRunSetupCompletedAt : '',
      editorFontSize: clampNumber(parsed.editorFontSize, DEFAULT_PREFERENCES.editorFontSize, 10, 28),
      autoSaveDelaySeconds: clampNumber(parsed.autoSaveDelaySeconds, DEFAULT_PREFERENCES.autoSaveDelaySeconds, 1, 30),
      lastActivePage: normalizeWorkspacePage(parsed.lastActivePage),
      defaultWorkspacePath: parsed.defaultWorkspacePath?.trim() || DEFAULT_PREFERENCES.defaultWorkspacePath,
      lastWorkspacePath: parsed.lastWorkspacePath?.trim() || parsed.defaultWorkspacePath?.trim() || DEFAULT_PREFERENCES.lastWorkspacePath,
      // Security: API keys are session-only. Older saved keys are intentionally ignored.
      aiOpenAiApiKey: '',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function redactSensitivePreferences(preferences: AppPreferences): AppPreferences {
  return {
    ...preferences,
    // Security: do not persist API keys or secrets in browser/local storage.
    aiOpenAiApiKey: '',
  };
}

function savePreferences(preferences: AppPreferences) {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(redactSensitivePreferences(preferences), null, 2));
}


const TOOL_REGISTRY_STORAGE_KEY = 'diligent-code-studio.tool-registry.v1';

const DEFAULT_TOOL_REGISTRY: ToolRegistryItem[] = [
  {
    id: 'tool-git-status',
    name: 'Git Status',
    category: 'Source Control',
    command: 'git status',
    description: 'Show current repository branch and changed files.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-npm-install',
    name: 'npm Install',
    category: 'Node / Web',
    command: 'npm install',
    description: 'Install Node.js dependencies for the active workspace.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-npm-build',
    name: 'npm Build',
    category: 'Node / Web',
    command: 'npm run build',
    description: 'Run the configured npm build script.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-vite-dev-local',
    name: 'Vite Local Preview',
    category: 'Web Builder',
    command: 'npm run dev -- --host 127.0.0.1',
    description: 'Host a Vite/React site locally for development on this computer.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-vite-dev-lan',
    name: 'Vite LAN Preview',
    category: 'Web Builder',
    command: 'npm run dev -- --host 0.0.0.0',
    description: 'Host a local preview on your network so another device can test it.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-vite-preview',
    name: 'Vite Production Preview',
    category: 'Web Builder',
    command: 'npm run preview -- --host 127.0.0.1',
    description: 'Preview the production build locally after npm run build.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-vercel-deploy',
    name: 'Vercel Deploy',
    category: 'Web Deployment',
    command: 'npx vercel',
    description: 'Deploy a web project to Vercel using the official CLI workflow.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-netlify-deploy',
    name: 'Netlify Deploy Preview',
    category: 'Web Deployment',
    command: 'npx netlify-cli deploy',
    description: 'Create a Netlify deploy preview from the active web project.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-tauri-build',
    name: 'Tauri Build',
    category: 'Release',
    command: 'npm run tauri:build',
    description: 'Build the desktop app and create Tauri bundle artifacts.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-cargo-check',
    name: 'Cargo Check',
    category: 'Rust / Tauri',
    command: 'cd src-tauri; cargo check',
    description: 'Run a fast Rust compile check for a Tauri project.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-dotnet-build',
    name: 'dotnet Build',
    category: '.NET',
    command: 'dotnet build',
    description: 'Build a .NET solution or project from the terminal working folder.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-open-explorer',
    name: 'Open Workspace in Explorer',
    category: 'Workspace',
    command: 'explorer.exe .',
    description: 'Open the current terminal folder in Windows File Explorer.',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'tool-checksums-script',
    name: 'Diligent Release Script',
    category: 'Release',
    command: 'PowerShell -ExecutionPolicy Bypass -File .\\scripts\\Build-DiligentRelease.ps1',
    description: 'Run the included release helper script when present.',
    enabled: true,
    builtIn: true,
  },
];

function normalizeToolRegistryItem(item: Partial<ToolRegistryItem>, index: number): ToolRegistryItem | null {
  const name = String(item.name ?? '').trim();
  const command = String(item.command ?? '').trim();
  if (!name || !command) return null;

  return {
    id: String(item.id ?? `custom-tool-${Date.now()}-${index}`),
    name,
    category: String(item.category ?? 'Custom').trim() || 'Custom',
    command,
    description: String(item.description ?? '').trim(),
    enabled: Boolean(item.enabled ?? true),
    builtIn: Boolean(item.builtIn ?? false),
  };
}

function loadToolRegistry(): ToolRegistryItem[] {
  try {
    const raw = window.localStorage.getItem(TOOL_REGISTRY_STORAGE_KEY);
    if (!raw) return DEFAULT_TOOL_REGISTRY;
    const parsed = JSON.parse(raw) as Partial<ToolRegistryItem>[];
    if (!Array.isArray(parsed)) return DEFAULT_TOOL_REGISTRY;
    const normalized = parsed
      .map((item, index) => normalizeToolRegistryItem(item, index))
      .filter((item): item is ToolRegistryItem => Boolean(item));
    return normalized.length > 0 ? normalized : DEFAULT_TOOL_REGISTRY;
  } catch {
    return DEFAULT_TOOL_REGISTRY;
  }
}

function saveToolRegistry(items: ToolRegistryItem[]) {
  window.localStorage.setItem(TOOL_REGISTRY_STORAGE_KEY, JSON.stringify(items, null, 2));
}

function newCustomRegistryDraft(): ToolRegistryItem {
  return {
    id: '',
    name: '',
    category: 'Custom',
    command: '',
    description: '',
    enabled: true,
    builtIn: false,
  };
}

function workspaceFromPreferences(preferences: AppPreferences): string {
  if (preferences.rememberLastWorkspace && preferences.lastWorkspacePath.trim()) {
    return preferences.lastWorkspacePath.trim();
  }
  return preferences.defaultWorkspacePath.trim() || DEFAULT_PREFERENCES.defaultWorkspacePath;
}

function collapsedStorageKey(workspacePath: string): string {
  return `diligent-code-studio.collapsed-folders.${workspacePath.replace(/[^a-z0-9_-]+/gi, '_')}`;
}


type RecentFileItem = {
  path: string;
  name: string;
  language: string;
  openedAt: string;
};

const RECENT_FILES_STORAGE_KEY = 'diligent-code-studio.recent-files.v1';

function loadRecentFiles(): RecentFileItem[] {
  try {
    const raw = window.localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentFileItem[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.path && item?.name).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function saveRecentFiles(files: RecentFileItem[]) {
  window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(files.slice(0, 12), null, 2));
}

function formatLanguageLabel(language?: string): string {
  return languageLabelFromId(language);
}

function countLines(text: string): number {
  if (!text) return 1;
  return text.split('\n').length;
}

type FindMatch = {
  start: number;
  end: number;
  lineNumber: number;
  column: number;
  preview: string;
};

function isWordCharacter(value: string): boolean {
  return /[A-Za-z0-9_]/.test(value);
}

function getLineColumnAndPreview(text: string, index: number): Pick<FindMatch, 'lineNumber' | 'column' | 'preview'> {
  let lineNumber = 1;
  let lineStart = 0;

  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') {
      lineNumber += 1;
      lineStart = i + 1;
    }
  }

  let lineEnd = text.indexOf('\n', index);
  if (lineEnd === -1) lineEnd = text.length;

  const preview = text.slice(lineStart, lineEnd).replace(/\r/g, '').trim();
  return {
    lineNumber,
    column: index - lineStart + 1,
    preview: preview.length > 160 ? `${preview.slice(0, 157)}...` : preview,
  };
}

function findMatchesInText(
  text: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): FindMatch[] {
  if (!query) return [];

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: FindMatch[] = [];
  let cursor = 0;

  while (cursor <= haystack.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) break;

    const before = index > 0 ? text[index - 1] : '';
    const after = index + query.length < text.length ? text[index + query.length] : '';
    const isWholeWord = !wholeWord || (!isWordCharacter(before) && !isWordCharacter(after));

    if (isWholeWord) {
      const location = getLineColumnAndPreview(text, index);
      matches.push({
        start: index,
        end: index + query.length,
        ...location,
      });
    }

    cursor = index + Math.max(needle.length, 1);
  }

  return matches;
}


type OpenSourceCredit = {
  name: string;
  category: string;
  role: string;
  website: string;
};

const OPEN_SOURCE_CREDITS: OpenSourceCredit[] = [
  { name: 'React', category: 'Frontend Framework', role: 'User interface foundation for the application shell and workspace pages.', website: 'https://react.dev/' },
  { name: 'React DOM', category: 'Frontend Framework', role: 'Renders the React interface into the desktop webview.', website: 'https://react.dev/reference/react-dom' },
  { name: 'Vite', category: 'Frontend Build Tool', role: 'Fast frontend dev server and production build pipeline.', website: 'https://vite.dev/' },
  { name: 'TypeScript', category: 'Language / Type Safety', role: 'Type checking and safer JavaScript application development.', website: 'https://www.typescriptlang.org/' },
  { name: 'Monaco Editor', category: 'Editor Component', role: 'Code editor engine used for the main editing experience.', website: 'https://microsoft.github.io/monaco-editor/' },
  { name: '@monaco-editor/react', category: 'Editor Component', role: 'React integration wrapper for Monaco Editor.', website: 'https://github.com/suren-atoyan/monaco-react' },
  { name: 'Lucide', category: 'Icon Library', role: 'Clean open-source icon set used throughout the interface.', website: 'https://lucide.dev/' },
  { name: 'Tauri', category: 'Desktop App Framework', role: 'Rust-backed desktop application framework for packaging the app.', website: 'https://tauri.app/' },
  { name: '@tauri-apps/api', category: 'Desktop App Framework', role: 'Frontend bridge used to call safe native backend commands.', website: 'https://tauri.app/reference/javascript/api/' },
  { name: 'Tauri CLI', category: 'Desktop Build Tool', role: 'Native app build, development, and bundling workflow.', website: 'https://tauri.app/reference/cli/' },
  { name: 'Rust', category: 'Language / Backend', role: 'Native backend language used for file operations, command execution, and packaging support.', website: 'https://www.rust-lang.org/' },
  { name: 'Cargo', category: 'Rust Build Tool', role: 'Rust package manager and build system used by the Tauri backend.', website: 'https://doc.rust-lang.org/cargo/' },
  { name: 'Serde', category: 'Rust Library', role: 'Serialization and deserialization support for Rust data structures.', website: 'https://serde.rs/' },
  { name: 'serde_json', category: 'Rust Library', role: 'JSON serialization support for backend commands and responses.', website: 'https://github.com/serde-rs/json' },
  { name: 'sha2', category: 'Rust Library', role: 'SHA-256 hashing support used for file checksum features.', website: 'https://github.com/RustCrypto/hashes' },
  { name: 'hex', category: 'Rust Library', role: 'Hex encoding support for generated hashes.', website: 'https://github.com/KokaKiwi/rust-hex' },
  { name: 'rfd', category: 'Rust Library', role: 'Native file and folder dialogs.', website: 'https://github.com/PolyMeilex/rfd' },
  { name: 'reqwest', category: 'Rust Library', role: 'HTTP client support for AI and local service checks.', website: 'https://github.com/seanmonstar/reqwest' },
  { name: 'rustls', category: 'Rust Library', role: 'TLS support used through the Rust HTTP stack.', website: 'https://github.com/rustls/rustls' },
  { name: 'Node.js', category: 'Runtime / Tooling', role: 'JavaScript runtime used for frontend development and package scripts.', website: 'https://nodejs.org/' },
  { name: 'npm', category: 'Package Manager', role: 'JavaScript dependency installation and script runner.', website: 'https://www.npmjs.com/' },
  { name: 'Git', category: 'Source Control', role: 'Version control support and project history management.', website: 'https://git-scm.com/' },
  { name: 'GitHub CLI', category: 'Source Control', role: 'GitHub login, repository, and release workflow support.', website: 'https://cli.github.com/' },
  { name: 'Ollama', category: 'Local AI', role: 'Optional local AI model hosting for privacy-friendly assistant workflows.', website: 'https://ollama.com/' },
  { name: 'Tailwind CSS', category: 'Web Builder Tool', role: 'Supported installable utility-first CSS framework for generated web projects.', website: 'https://tailwindcss.com/' },
  { name: 'Bootstrap', category: 'Web Builder Tool', role: 'Supported installable CSS and component framework for web projects.', website: 'https://getbootstrap.com/' },
  { name: 'React Router', category: 'Web Builder Tool', role: 'Supported installable routing library for React website projects.', website: 'https://reactrouter.com/' },
  { name: 'Framer Motion', category: 'Web Builder Tool', role: 'Supported installable animation library for web interfaces.', website: 'https://motion.dev/' },
  { name: 'Recharts', category: 'Web Builder Tool', role: 'Supported installable React charting library.', website: 'https://recharts.org/' },
  { name: 'ESLint', category: 'Quality Tool', role: 'Supported linting tool for JavaScript and TypeScript projects.', website: 'https://eslint.org/' },
  { name: 'Prettier', category: 'Quality Tool', role: 'Supported formatting tool for consistent project style.', website: 'https://prettier.io/' },
  { name: 'Vercel CLI', category: 'Deployment Tool', role: 'Supported global web deployment workflow for Vercel projects.', website: 'https://vercel.com/docs/cli' },
  { name: 'Netlify CLI', category: 'Deployment Tool', role: 'Supported global web deployment workflow for Netlify projects.', website: 'https://docs.netlify.com/cli/get-started/' },
];

export default function App() {
  const editorRef = useRef<any>(null);
  const terminalOutputRef = useRef<HTMLPreElement | null>(null);
  const releaseOutputRef = useRef<HTMLPreElement | null>(null);
  const diagnosticsOutputRef = useRef<HTMLPreElement | null>(null);
  const startupLoadedRef = useRef(false);
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const [draggedMenuPage, setDraggedMenuPage] = useState<WorkspacePage | null>(null);
  const [dragOverMenuPage, setDragOverMenuPage] = useState<WorkspacePage | null>(null);
  const [dragOverMenuDropSide, setDragOverMenuDropSide] = useState<MenuDropPlacement>('before');
  const menuDragRef = useRef<{
    page: WorkspacePage;
    pointerId: number;
    startX: number;
    startY: number;
    isDragging: boolean;
    targetPage: WorkspacePage | null;
    targetPlacement: MenuDropPlacement;
  } | null>(null);
  const suppressNextMenuClickRef = useRef(false);
  const [workspacePath, setWorkspacePath] = useState(() => workspaceFromPreferences(loadPreferences()));
  const [terminalCwd, setTerminalCwd] = useState(() => workspaceFromPreferences(loadPreferences()));
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([
    { at: nowStamp(), level: 'info', message: 'Diligent Code Studio v0.7.0-dev loaded. First Run Setup Wizard foundation is active.' },
  ]);
  const [terminalCommand, setTerminalCommand] = useState('git status');
  const [terminalOutput, setTerminalOutput] = useState(
    'Diligent Terminal ready. Version 0.7.0-dev starts the First Run Setup Wizard improvement track.\n',
  );
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExtensionFilter, setSearchExtensionFilter] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchRunning, setSearchRunning] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [activePage, setActivePage] = useState<WorkspacePage>(() => loadPreferences().rememberLastActivePage ? loadPreferences().lastActivePage : 'editor');
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('terminal');
  const [findSearchMode, setFindSearchMode] = useState<'current' | 'workspace'>('current');
  const [gitStatus, setGitStatus] = useState<GitStatusInfo | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [tagName, setTagName] = useState('');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [releaseResult, setReleaseResult] = useState<ReleasePackageResult | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseOutput, setReleaseOutput] = useState('Release Builder ready. Run npm build, then Tauri build, then create a packaged release.\n');
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('blank');
  const [newProjectName, setNewProjectName] = useState('MyDiligentProject');
  const [templateParentPath, setTemplateParentPath] = useState('C:\\DiligentProjects');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateResult, setTemplateResult] = useState<ProjectTemplateResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticRunResult | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsOutput, setDiagnosticsOutput] = useState('Problems ready. Run diagnostics to capture TypeScript/Vite and Rust/Cargo output.\n');
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });
  const [recentFiles, setRecentFiles] = useState<RecentFileItem[]>(() => loadRecentFiles());

  const [toolRegistryItems, setToolRegistryItems] = useState<ToolRegistryItem[]>(() => loadToolRegistry());
  const [registryCategoryFilter, setRegistryCategoryFilter] = useState('All');
  const [registryDraft, setRegistryDraft] = useState<ToolRegistryItem>(() => newCustomRegistryDraft());

  const [aiPrompt, setAiPrompt] = useState('Explain what this code does and point out any risky areas.');
  const [aiResponse, setAiResponse] = useState('AI Coding Assistant ready. Configure OpenAI or Ollama in Settings, then ask about the whole project, current file, selected code, diagnostics, terminal output, Git status, README files, installer scripts, or missing files.\n');
  const [aiHelpPrompt, setAiHelpPrompt] = useState('How do I use this screen?');
  const [aiHelpResponse, setAiHelpResponse] = useState('AI Help is minimized by default. Open it from the upper-right AI Help button for navigation help and quick questions. Full coding responses appear in the AI Coding Assistant window.\n');
  const [aiContextMode, setAiContextMode] = useState<AiContextPreference>(() => loadPreferences().aiDefaultContext);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDockOpen, setAiDockOpen] = useState(false);
  const [aiHelpPosition, setAiHelpPosition] = useState<FloatingPanelPosition>(() => loadAiHelpPosition());
  const [aiHelpDragging, setAiHelpDragging] = useState(false);
  const aiHelpDragRef = useRef<{ pointerId: number; startX: number; startY: number; startLeft: number; startTop: number; width: number; height: number } | null>(null);
  const assistantPocketRef = useRef<HTMLElement | null>(null);
  const [helpManualOpen, setHelpManualOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      const loadedPreferences = loadPreferences();
      if (loadedPreferences.firstRunSetupCompleted) return false;
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'completed';
    } catch {
      return true;
    }
  });
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusInfo | null>(null);
  const [setupDependencies, setSetupDependencies] = useState<SetupDependency[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupInstallBusyId, setSetupInstallBusyId] = useState('');
  const [setupOutput, setSetupOutput] = useState('Setup & Dependencies ready. Use Check Again to refresh installed tools. Installer buttons ask for confirmation first.\n');


  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activePath) ?? null,
    [openFiles, activePath],
  );

  const unsavedFileCount = useMemo(
    () => openFiles.filter((file) => file.dirty).length,
    [openFiles],
  );

  const currentFileFindMatches = useMemo(
    () => activeFile ? findMatchesInText(activeFile.content, findQuery, findCaseSensitive, findWholeWord) : [],
    [activeFile, findQuery, findCaseSensitive, findWholeWord],
  );

  const shownEntries = useMemo(
    () => visibleEntries(entries, collapsedDirectories, filterText),
    [entries, collapsedDirectories, filterText],
  );

  const workspaceStats = useMemo(() => {
    const folders = entries.filter((entry) => entry.is_dir).length;
    const files = entries.length - folders;
    return { folders, files };
  }, [entries]);


  const registryCategories = useMemo(() => {
    const categories = [...new Set(toolRegistryItems.map((item) => item.category || 'Custom'))].sort();
    return ['All', ...categories];
  }, [toolRegistryItems]);

  const filteredRegistryItems = useMemo(() => {
    return toolRegistryItems.filter((item) =>
      item.enabled && (registryCategoryFilter === 'All' || item.category === registryCategoryFilter),
    );
  }, [toolRegistryItems, registryCategoryFilter]);

  const registryStats = useMemo(() => {
    const builtIn = toolRegistryItems.filter((item) => item.builtIn).length;
    const custom = toolRegistryItems.filter((item) => !item.builtIn).length;
    const enabled = toolRegistryItems.filter((item) => item.enabled).length;
    return { builtIn, custom, enabled, total: toolRegistryItems.length };
  }, [toolRegistryItems]);



  const setupCategories = useMemo(() => {
    const categories: Record<string, SetupDependency[]> = {};
    for (const item of setupDependencies) {
      const category = item.category || 'Other';
      if (!categories[category]) categories[category] = [];
      categories[category].push(item);
    }
    return Object.entries(categories);
  }, [setupDependencies]);

  const setupStats = useMemo(() => {
    const required = setupDependencies.filter((item) => item.required);
    const optional = setupDependencies.filter((item) => !item.required);
    return {
      total: setupDependencies.length,
      installed: setupDependencies.filter((item) => item.available).length,
      missingRequired: required.filter((item) => !item.available).length,
      optionalMissing: optional.filter((item) => !item.available).length,
    };
  }, [setupDependencies]);

  const npmCommand = platformInfo?.npm_command || 'npm';
  const isWindowsPlatform = !platformInfo || platformInfo.os === 'windows';

  const webBuilderActions = useMemo(() => [
    {
      title: 'Local dev server',
      mode: 'Local',
      command: `${npmCommand} run dev -- --host 127.0.0.1`,
      description: 'Runs the project development server only on this computer. Best for normal editing and live preview.',
    },
    {
      title: 'LAN preview server',
      mode: 'Local network',
      command: `${npmCommand} run dev -- --host 0.0.0.0`,
      description: 'Runs the dev server on your local network so phones or another PC can test the site.',
    },
    {
      title: 'Production build',
      mode: 'Build',
      command: `${npmCommand} run build`,
      description: 'Creates optimized static files in dist/ for deployment or production preview.',
    },
    {
      title: 'Production preview',
      mode: 'Local',
      command: `${npmCommand} run preview -- --host 127.0.0.1`,
      description: 'Serves the production dist/ build locally so you can test the final output.',
    },
    {
      title: 'Vercel preview deploy',
      mode: 'Global',
      command: 'npx vercel',
      description: 'Deploys a preview using Vercel CLI. Requires Vercel login and project linking.',
    },
    {
      title: 'Vercel production deploy',
      mode: 'Global',
      command: 'npx vercel --prod',
      description: 'Deploys the current web project to production on Vercel.',
    },
    {
      title: 'Netlify preview deploy',
      mode: 'Global',
      command: 'npx netlify-cli deploy',
      description: 'Creates a Netlify deploy preview. Requires Netlify login/linking.',
    },
    {
      title: 'Netlify production deploy',
      mode: 'Global',
      command: 'npx netlify-cli deploy --prod',
      description: 'Deploys the current web project to production on Netlify.',
    },
  ], [npmCommand]);

  const webComponentActions = useMemo(() => [
    {
      name: 'React Router',
      command: `${npmCommand} install react-router-dom`,
      description: 'Client-side page routing for React web apps.',
    },
    {
      name: 'Tailwind CSS',
      command: `${npmCommand} install -D tailwindcss @tailwindcss/vite`,
      description: 'Utility-first CSS framework for modern responsive web design.',
    },
    {
      name: 'Bootstrap',
      command: `${npmCommand} install bootstrap`,
      description: 'Popular component and layout CSS toolkit.',
    },
    {
      name: 'Lucide Icons',
      command: `${npmCommand} install lucide-react`,
      description: 'Clean SVG icon set for React interfaces.',
    },
    {
      name: 'Framer Motion',
      command: `${npmCommand} install framer-motion`,
      description: 'Animation library for polished web interactions.',
    },
    {
      name: 'Recharts',
      command: `${npmCommand} install recharts`,
      description: 'Charts and dashboards for React web projects.',
    },
    {
      name: 'ESLint + Prettier',
      command: `${npmCommand} install -D eslint prettier`,
      description: 'Code quality and formatting tools for web projects.',
    },
    {
      name: 'Vercel CLI',
      command: `${npmCommand} install -g vercel`,
      description: 'Global deployment CLI for Vercel hosting.',
    },
    {
      name: 'Netlify CLI',
      command: `${npmCommand} install -g netlify-cli`,
      description: 'Global deployment CLI for Netlify hosting.',
    },
  ], [npmCommand]);


  function shellLabel(value: TerminalShellPreference): string {
    switch (value) {
      case 'auto': return platformInfo ? `Auto (${platformInfo.default_shell})` : 'Auto';
      case 'powershell': return isWindowsPlatform ? 'Windows PowerShell' : 'PowerShell 7';
      case 'pwsh': return 'PowerShell 7';
      case 'cmd': return 'Command Prompt';
      case 'bash': return 'bash';
      case 'zsh': return 'zsh';
      default: return String(value);
    }
  }

  const targetDirectory = useMemo(() => {
    if (selectedEntry?.is_dir) return selectedEntry.path;
    if (selectedEntry) return dirname(selectedEntry.path);
    if (activeFile) return dirname(activeFile.path);
    return workspacePath;
  }, [activeFile, selectedEntry, workspacePath]);

  const quickCommands = useMemo<QuickCommand[]>(() => {
    const listCommand = isWindowsPlatform ? 'Get-ChildItem' : 'ls -la';
    const commands: QuickCommand[] = [{ label: 'List Files', command: listCommand }];

    if (projectInfo?.has_git_repository) {
      commands.push({ label: 'Git Status', command: 'git status' });
    } else {
      commands.push({ label: 'Init Git', command: 'git init', className: 'warn-command' });
    }

    if (projectInfo?.has_package_json) {
      commands.push({ label: 'npm Install', command: `${npmCommand} install` });
      commands.push({ label: 'npm Build', command: `${npmCommand} run build` });
    }

    if (projectInfo?.has_cargo_toml) {
      const cargoCommand = projectInfo.has_tauri_project && projectInfo.cargo_working_directory
        ? isWindowsPlatform
          ? `Set-Location -LiteralPath "${projectInfo.cargo_working_directory}"; cargo build`
          : `cd "${projectInfo.cargo_working_directory}" && cargo build`
        : 'cargo build';
      commands.push({ label: 'Cargo Build', command: cargoCommand });
    }

    if (projectInfo?.has_solution || projectInfo?.has_csproj) {
      commands.push({ label: '.NET Build', command: 'dotnet build' });
    }

    if (projectInfo?.has_powershell_scripts) {
      commands.push({ label: 'Find PS1', command: isWindowsPlatform ? 'Get-ChildItem -Recurse -Filter *.ps1' : "find . -name '*.ps1'" });
    }

    return commands;
  }, [projectInfo, isWindowsPlatform, npmCommand]);

  const languageGroups = useMemo(() => supportedLanguageGroups(), []);

  const activePageTitle = useMemo(() => {
    switch (activePage) {
      case 'editor': return activeFile ? activeFile.name : 'Editor';
      case 'ai': return 'AI Coding Assistant';
      case 'findsearch': return findSearchMode === 'current' ? 'Find / Replace Current File' : 'Search Across Workspace';
      case 'terminal': return 'Terminal';
      case 'git': return 'Git Source Control';
      case 'problems': return 'Problems / Diagnostics';
      case 'release': return 'Release Builder';
      case 'templates': return 'Project Templates';
      case 'start': return 'Start Here';
      case 'web': return 'Web Builder';
      case 'setup': return 'Setup & Dependencies';
      case 'registry': return 'Tool Registry';
      case 'project': return 'Project Health Dashboard';
      case 'logs': return 'Activity Logs';
      case 'credits': return 'Open Source Credits';
      case 'settings': return 'Settings / Preferences';
      default: return 'Diligent Code Studio';
    }
  }, [activeFile, activePage, findSearchMode]);

  useEffect(() => {
    refreshPlatformInfo();
    // Tool checks are intentionally manual/on-demand.
    // Running npm/git/gh version checks at startup can cause a console/npm window to appear on Windows.
    if (!startupLoadedRef.current && preferences.openWorkspaceOnStartup) {
      startupLoadedRef.current = true;
      const startupPath = workspaceFromPreferences(preferences);
      if (startupPath.trim()) {
        void openWorkspace(startupPath);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);


  useEffect(() => {
    saveToolRegistry(toolRegistryItems);
  }, [toolRegistryItems]);

  useEffect(() => {
    if (!preferences.rememberLastActivePage || preferences.lastActivePage === activePage) return;
    setPreferences((current) => ({ ...current, lastActivePage: activePage }));
  }, [activePage, preferences.rememberLastActivePage, preferences.lastActivePage]);

  useEffect(() => {
    if (!preferences.rememberExpandedFolders || !workspacePath.trim()) return;
    try {
      window.localStorage.setItem(collapsedStorageKey(workspacePath), JSON.stringify([...collapsedDirectories]));
    } catch {
      // Best-effort preference persistence only.
    }
  }, [collapsedDirectories, preferences.rememberExpandedFolders, workspacePath]);

  useEffect(() => {
    if (activePage === 'git' && workspacePath.trim()) {
      void refreshGitStatus(workspacePath, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, workspacePath]);

  useEffect(() => {
    if (activePage === 'release' && workspacePath.trim()) {
      void refreshReleaseInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, workspacePath]);

  useEffect(() => {
    if (activePage === 'templates') {
      void refreshTemplates();
      if (workspacePath.trim()) {
        setTemplateParentPath(workspacePath.trim());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, workspacePath]);

  useEffect(() => {
    if (preferences.aiProvider !== 'ollama') return;
    if (activePage !== 'settings' && activePage !== 'ai' && activePage !== 'editor') return;
    if (ollamaModels.length > 0 || ollamaModelsLoading || ollamaModelsError) return;
    void refreshOllamaModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.aiProvider, preferences.aiOllamaEndpoint, activePage]);

  useEffect(() => {
    if (!preferences.autoSave || !activeFile?.dirty) return;

    const timer = window.setTimeout(async () => {
      try {
        await invoke('write_text_file', { path: activeFile.path, contents: activeFile.content });
        const sha256 = await invoke<string>('calculate_sha256', { path: activeFile.path });
        setOpenFiles((current) =>
          current.map((file) =>
            file.path === activeFile.path && file.content === activeFile.content
              ? { ...file, dirty: false, sha256 }
              : file,
          ),
        );
        log('success', `Auto-saved file: ${activeFile.name}`);
      } catch (error) {
        log('error', `Auto-save failed: ${String(error)}`);
      }
    }, preferences.autoSaveDelaySeconds * 1000);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.autoSave, preferences.autoSaveDelaySeconds, activeFile?.path, activeFile?.content, activeFile?.dirty]);

  useEffect(() => {
    setActiveFindIndex(0);
  }, [activePath, findQuery, findCaseSensitive, findWholeWord]);

  useEffect(() => {
    if (currentFileFindMatches.length === 0) {
      setActiveFindIndex(0);
      return;
    }

    setActiveFindIndex((current) => Math.min(current, currentFileFindMatches.length - 1));
  }, [currentFileFindMatches.length]);


  useEffect(() => {
    if (!terminalOutputRef.current) return;

    window.requestAnimationFrame(() => {
      if (!terminalOutputRef.current) return;
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    });
  }, [terminalOutput, activePage]);

  useEffect(() => {
    if (!releaseOutputRef.current) return;

    window.requestAnimationFrame(() => {
      if (!releaseOutputRef.current) return;
      releaseOutputRef.current.scrollTop = releaseOutputRef.current.scrollHeight;
    });
  }, [releaseOutput, activePage]);

  useEffect(() => {
    if (!diagnosticsOutputRef.current) return;

    window.requestAnimationFrame(() => {
      if (!diagnosticsOutputRef.current) return;
      diagnosticsOutputRef.current.scrollTop = diagnosticsOutputRef.current.scrollHeight;
    });
  }, [diagnosticsOutput, activePage]);


  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (openFiles.some((file) => file.dirty)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [openFiles]);

  function log(level: ActivityItem['level'], message: string) {
    setActivity((current) => [{ at: nowStamp(), level, message }, ...current].slice(0, 250));
  }

  function appendTerminal(text: string) {
    setTerminalOutput((current) => `${current}${current.endsWith('\n') ? '' : '\n'}${text}`);
  }

  function updatePreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function activateWorkspacePage(page: WorkspacePage) {
    setActivePage(page);

    if (page === 'git') {
      void refreshGitStatus(workspacePath, true);
    }

    if (page === 'release') {
      void refreshReleaseInfo();
    }

    if (page === 'templates') {
      void refreshTemplates();
    }

    if (page === 'setup') {
      void refreshSetupDependencies();
    }
  }

  function reorderMenuPage(draggedPage: WorkspacePage, targetPage: WorkspacePage, placement: MenuDropPlacement = 'before') {
    if (draggedPage === targetPage) return;

    let changed = false;
    setPreferences((current) => {
      const order = normalizePageOrder(current.menuPageOrder);
      if (!order.includes(draggedPage) || !order.includes(targetPage)) return current;

      const next = order.filter((page) => page !== draggedPage);
      const targetIndex = next.indexOf(targetPage);
      if (targetIndex < 0) return current;

      const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
      next.splice(insertIndex, 0, draggedPage);

      if (next.join('|') === order.join('|')) return current;
      changed = true;
      return { ...current, menuPageOrder: next };
    });

    if (changed) {
      log('info', `Workspace menu moved: ${workspacePageLabel(draggedPage)} ${placement} ${workspacePageLabel(targetPage)}.`);
    }
  }

  function clearMenuDragState() {
    menuDragRef.current = null;
    setDraggedMenuPage(null);
    setDragOverMenuPage(null);
    setDragOverMenuDropSide('before');
  }

  function updateMenuDragTarget(clientX: number, clientY: number) {
    const drag = menuDragRef.current;
    if (!drag) return;

    const element = document.elementFromPoint(clientX, clientY)?.closest('[data-workspace-page]');
    if (!element) return;

    const targetPage = element.getAttribute('data-workspace-page');
    if (!isWorkspacePage(targetPage)) return;

    const rect = element.getBoundingClientRect();
    const placement: MenuDropPlacement = clientX > rect.left + rect.width / 2 ? 'after' : 'before';
    drag.targetPage = targetPage;
    drag.targetPlacement = placement;
    setDragOverMenuPage(targetPage);
    setDragOverMenuDropSide(placement);
  }

  function handleMenuPointerDown(page: WorkspacePage, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    menuDragRef.current = {
      page,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
      targetPage: page,
      targetPlacement: 'before',
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleMenuPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = menuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.isDragging && distance >= 6) {
      drag.isDragging = true;
      suppressNextMenuClickRef.current = true;
      setDraggedMenuPage(drag.page);
    }

    if (!drag.isDragging) return;

    event.preventDefault();
    updateMenuDragTarget(event.clientX, event.clientY);
  }

  function handleMenuPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = menuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.isDragging && drag.targetPage) {
      event.preventDefault();
      suppressNextMenuClickRef.current = true;
      reorderMenuPage(drag.page, drag.targetPage, drag.targetPlacement);
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    clearMenuDragState();
  }

  function handleMenuPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = menuDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      clearMenuDragState();
    }
  }

  function handleWorkspaceMenuClick(page: WorkspacePage, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressNextMenuClickRef.current) {
      suppressNextMenuClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    activateWorkspacePage(page);
  }

  function resetMenuPageOrder() {
    setPreferences((current) => ({ ...current, menuPageOrder: [...DEFAULT_PAGE_ORDER] }));
    log('info', 'Workspace menu button order reset to defaults.');
  }

  function workspacePageIcon(page: WorkspacePage) {
    switch (page) {
      case 'editor': return <FileCode2 size={14} />;
      case 'ai': return <Bot size={14} />;
      case 'findsearch': return <Search size={14} />;
      case 'terminal': return <TerminalSquare size={14} />;
      case 'git': return <GitBranch size={14} />;
      case 'problems': return <AlertTriangle size={14} />;
      case 'release': return <PackageCheck size={14} />;
      case 'templates': return <LayoutTemplate size={14} />;
      case 'start': return <Rocket size={14} />;
      case 'web': return <Globe2 size={14} />;
      case 'setup': return <PackageCheck size={14} />;
      case 'registry': return <Wrench size={14} />;
      case 'project': return <PackageCheck size={14} />;
      case 'logs': return <AlertTriangle size={14} />;
      case 'credits': return <ExternalLink size={14} />;
      case 'settings': return <SlidersHorizontal size={14} />;
      default: return <FileCode2 size={14} />;
    }
  }


  function pageGuide(page: WorkspacePage) {
    switch (page) {
      case 'start':
        return {
          title: 'Start Here',
          summary: 'Use this dashboard when you are not sure where to begin. It points you to setup, projects, AI help, web building, and release packaging.',
          nextStep: workspacePath.trim() ? 'Open or create a file, then use AI Coding Assistant to review the project.' : 'Choose a workspace folder or create a sample project from Templates.',
          prompt: 'Explain the Start Here dashboard and recommend the next best step for my current workspace.',
        };
      case 'templates':
        return {
          title: 'Project Templates',
          summary: 'Create sample projects and starter structures so a new user can learn by clicking something that works.',
          nextStep: 'Pick a template, choose a parent folder, create the project, then open the new folder as your workspace.',
          prompt: 'Help me choose the best project template and explain what each template is used for.',
        };
      case 'web':
        return {
          title: 'Web Builder',
          summary: 'Build websites, preview them locally, test them on your LAN, and prepare global deployment commands.',
          nextStep: 'Create a web template, run local preview, then use production build before global deployment.',
          prompt: 'Explain the Web Builder screen and tell me how to host this site locally or globally.',
        };
      case 'setup':
        return {
          title: 'Setup & Dependencies',
          summary: 'Check whether this computer has the tools needed for coding, AI, Git, websites, installers, and desktop builds.',
          nextStep: 'Click Check Again, then install only the missing tools you actually need for your project type.',
          prompt: 'Explain which setup dependencies I need for this project and what I should install next.',
        };
      case 'editor':
        return {
          title: 'Editor',
          summary: 'Open, edit, save, format, and hash files from the selected workspace.',
          nextStep: activeFile ? 'Edit the active file, save it, then ask AI to explain or improve it.' : 'Choose a file from the left project tree or create a new file.',
          prompt: 'Explain how to use the Editor screen and what I should do with the current file.',
        };
      case 'ai':
        return {
          title: 'AI Coding Assistant',
          summary: 'Use this workspace for project-aware coding help, code reviews, bug finding, README generation, and installer script guidance.',
          nextStep: 'Choose Project context for broad help or Current File context for code-specific help.',
          prompt: 'Explain how the AI Coding Assistant should be used with this project.',
        };
      case 'findsearch':
        return {
          title: 'Find / Search',
          summary: 'Search inside the current file or across the entire workspace.',
          nextStep: 'Use workspace search when you need to find where a function, setting, or error message lives.',
          prompt: 'Explain how to use Find/Search to locate code or project settings.',
        };
      case 'terminal':
        return {
          title: 'Terminal',
          summary: 'Run project commands from inside the selected workspace and capture output for troubleshooting.',
          nextStep: 'Run a safe command like git status, npm run build, or npm run validate depending on your project.',
          prompt: 'Review the Terminal screen and tell me the safest next command to run for this project.',
        };
      case 'git':
        return {
          title: 'Git Source Control',
          summary: 'Check repository status, changed files, commits, tags, remotes, and GitHub readiness.',
          nextStep: 'Refresh Git status, review changed files, then commit with a clear message.',
          prompt: 'Explain the Git screen and help me understand the current repository status.',
        };
      case 'problems':
        return {
          title: 'Problems / Diagnostics',
          summary: 'Run validation and build checks to catch TypeScript, Vite, Rust, and packaging problems.',
          nextStep: 'Run diagnostics, then send the output to the AI Coding Assistant for a fix plan.',
          prompt: 'Explain the Problems screen and help me understand the current diagnostics output.',
        };
      case 'release':
        return {
          title: 'Release Builder',
          summary: 'Build, package, checksum, and prepare a release-ready ZIP or installer workflow.',
          nextStep: 'Validate the project first, then run release packaging and review the output folder.',
          prompt: 'Explain the Release Builder and help me prepare this project for a clean release.',
        };
      case 'registry':
        return {
          title: 'Tool Registry',
          summary: 'Manage reusable commands, web tools, build tools, and project utilities the app can run.',
          nextStep: 'Enable the tools you use often and add custom commands for your workflow.',
          prompt: 'Explain the Tool Registry and recommend useful tools for this project.',
        };
      case 'project':
        return {
          title: 'Project Health Dashboard',
          summary: 'See detected project type, Git status, platform details, language support, and common next actions.',
          nextStep: 'Use this page when you want a quick overview before building, debugging, or releasing.',
          prompt: 'Summarize this Project Health Dashboard and recommend the next best action.',
        };
      case 'logs':
        return {
          title: 'Activity Logs',
          summary: 'Review recent actions, warnings, installs, builds, and app-level events.',
          nextStep: 'Copy logs when asking for troubleshooting help or diagnosing what happened.',
          prompt: 'Explain the Activity Logs screen and help me interpret recent warnings or errors.',
        };
      case 'credits':
        return {
          title: 'Open Source Credits',
          summary: 'Honor the open-source frameworks, libraries, tools, and ecosystems that helped make Diligent Code Studio possible.',
          nextStep: 'Open a project website to review licenses, documentation, contributors, and community information.',
          prompt: 'Explain the Open Source Credits screen and why open-source acknowledgments matter for this project.',
        };
      case 'settings':
        return {
          title: 'Settings / Preferences',
          summary: 'Control appearance, beginner or advanced mode, AI provider, workspace behavior, terminal shell, and menu order.',
          nextStep: 'Use Beginner Mode for guidance or Advanced Mode when you want more technical controls.',
          prompt: 'Explain the Settings screen and recommend safe settings for a new user.',
        };
      default:
        return {
          title: 'Diligent Code Studio',
          summary: 'Use this workspace to build, test, troubleshoot, and release software with local-first AI support.',
          nextStep: 'Open Start Here if you are unsure what to do next.',
          prompt: 'Explain Diligent Code Studio and recommend the next best step.',
        };
    }
  }

  function openGuideForCurrentPage() {
    const guide = pageGuide(activePage);
    setAiHelpPrompt(guide.prompt);
    setAiHelpResponse(`Guide for ${guide.title}\n\nWhat this screen does:\n${guide.summary}\n\nGood next step:\n${guide.nextStep}\n\nYou can press Ask to have AI personalize this guidance using your current screen and workspace context.\n`);
    setAiDockOpen(true);
  }

  function completeOnboarding(page?: WorkspacePage) {
    const completedAt = new Date().toISOString();
    const selectedWorkspace = preferences.defaultWorkspacePath.trim() || DEFAULT_PREFERENCES.defaultWorkspacePath;

    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'completed');
    } catch {
      // Ignore local storage failures and continue with the selected action.
    }

    setPreferences((current) => ({
      ...current,
      defaultWorkspacePath: selectedWorkspace,
      lastWorkspacePath: selectedWorkspace,
      firstRunSetupCompleted: true,
      firstRunSetupCompletedAt: completedAt,
    }));
    setWorkspacePath(selectedWorkspace);
    setTerminalCwd(selectedWorkspace);
    setOnboardingOpen(false);
    log('success', `First Run Setup completed. Default workspace: ${selectedWorkspace}`);

    if (page) activateWorkspacePage(page);
  }

  function resetFirstRunSetup() {
    const confirmed = window.confirm('Reset First Run Setup so the wizard opens again? This will not erase your files or API keys.');
    if (!confirmed) return;

    try {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {
      // Ignore local storage failures and reopen the wizard anyway.
    }

    setPreferences((current) => ({
      ...current,
      firstRunSetupCompleted: false,
      firstRunSetupCompletedAt: '',
    }));
    setOnboardingOpen(true);
    log('warn', 'First Run Setup was reset and reopened.');
  }


  function rememberRecentFile(path: string, language: string) {
    const item: RecentFileItem = {
      path,
      name: basename(path),
      language,
      openedAt: new Date().toLocaleString(),
    };

    setRecentFiles((current) => {
      const next = [item, ...current.filter((file) => file.path !== path)].slice(0, 12);
      saveRecentFiles(next);
      return next;
    });
  }

  function clearRecentFiles() {
    setRecentFiles([]);
    saveRecentFiles([]);
    log('info', 'Recent files list cleared.');
  }

  function resetPreferences() {
    const confirmed = window.confirm('Reset Diligent Code Studio preferences to defaults?');
    if (!confirmed) return;

    setPreferences(DEFAULT_PREFERENCES);
    setWorkspacePath(DEFAULT_PREFERENCES.defaultWorkspacePath);
    setTerminalCwd(DEFAULT_PREFERENCES.defaultWorkspacePath);
    setActivePage('editor');
    log('warn', 'Settings were reset to defaults.');
  }

  function useCurrentWorkspaceAsDefault() {
    setPreferences((current) => ({
      ...current,
      defaultWorkspacePath: workspacePath,
      lastWorkspacePath: workspacePath,
    }));
    log('success', `Default workspace set to: ${workspacePath}`);
  }

  function toolAvailable(toolName: string): boolean {
    if (toolStatuses.length === 0) return true;
    const match = toolStatuses.find((tool) => tool.name.toLowerCase() === toolName.toLowerCase());
    return match?.available ?? true;
  }

  function commandBlockReason(command: string): string | null {
    const clean = command.trim().toLowerCase();

    if (clean === 'git init') {
      if (!toolAvailable('Git')) return 'Git is not available on PATH.';
      if (projectInfo?.has_git_repository) return 'This workspace already appears to be a Git repository.';
      return null;
    }

    if (clean.startsWith('git')) {
      if (!toolAvailable('Git')) return 'Git is not available on PATH.';
      if (clean === 'git --version' || clean === 'git -v' || clean.startsWith('git --help')) return null;
      if (clean.startsWith('git status') && !projectInfo?.has_git_repository) {
        return 'This workspace is not detected as a Git repository. Choose the actual project folder or run git init first.';
      }
    }

    if (clean.startsWith('npm') || clean.startsWith('npm.cmd')) {
      if (!toolAvailable('npm')) return 'npm is not available on PATH.';
      if (clean === 'npm --version' || clean === 'npm.cmd --version' || clean === 'npm -v' || clean === 'npm.cmd -v') return null;
      if (!projectInfo?.has_package_json) {
        return 'No package.json was detected in the workspace root. Choose a Node/Tauri project folder before running npm commands.';
      }
    }

    if (clean.startsWith('cargo')) {
      if (!toolAvailable('Cargo')) return 'Cargo is not available on PATH.';
      if (clean === 'cargo --version' || clean === 'cargo -v' || clean.startsWith('cargo --help')) return null;
      if (!projectInfo?.has_cargo_toml) {
        return 'No Cargo.toml or src-tauri/Cargo.toml was detected. Choose a Rust/Tauri project folder before running cargo build/test commands.';
      }
    }

    if (clean.startsWith('dotnet')) {
      if (!toolAvailable('dotnet')) return 'dotnet is not available on PATH.';
      if (clean === 'dotnet --version' || clean === 'dotnet --info' || clean.startsWith('dotnet --list')) return null;
      if (!projectInfo?.has_solution && !projectInfo?.has_csproj) {
        return 'No .sln or .csproj file was detected in this workspace scan.';
      }
    }

    return null;
  }

  async function refreshPlatformInfo() {
    try {
      const result = await invoke<PlatformInfo>('get_platform_info');
      setPlatformInfo(result);
    } catch (error) {
      log('warn', `Could not detect platform information: ${String(error)}`);
    }
  }

  async function refreshToolStatus() {
    try {
      const result = await invoke<ToolStatus[]>('check_development_tools');
      setToolStatuses(result);
      const missing = result.filter((tool) => !tool.available).map((tool) => tool.name);
      if (missing.length > 0) {
        log('warn', `Missing tools: ${missing.join(', ')}.`);
      } else {
        log('success', 'Development tool check passed.');
      }
    } catch (error) {
      log('error', `Tool check failed: ${String(error)}`);
    }
  }

  async function refreshSetupDependencies() {
    setSetupLoading(true);
    try {
      const result = await invoke<SetupDependency[]>('check_setup_dependencies');
      setSetupDependencies(result);
      const missingRequired = result.filter((item) => item.required && !item.available).map((item) => item.name);
      if (missingRequired.length > 0) {
        log('warn', `Setup check found missing required dependencies: ${missingRequired.join(', ')}.`);
      } else {
        log('success', 'Setup dependency check completed. Required dependencies are installed.');
      }
    } catch (error) {
      log('error', `Dependency setup check failed: ${String(error)}`);
      setSetupOutput((current) => `${current}[${nowStamp()}] Dependency setup check failed: ${String(error)}\n`);
    } finally {
      setSetupLoading(false);
    }
  }

  async function installSetupDependency(item: SetupDependency) {
    if (!item.install_supported) {
      log('warn', `${item.name} does not have an automatic installer for this platform.`);
      return;
    }

    const confirmed = window.confirm(
      `Install ${item.name}?\n\nThis will run:\n${item.install_command}\n\n${item.caution || 'The installer may open a separate setup window.'}`,
    );
    if (!confirmed) {
      log('warn', `Install cancelled for ${item.name}.`);
      return;
    }

    setSetupInstallBusyId(item.id);
    setSetupOutput((current) => `${current}\n[${nowStamp()}] Installing ${item.name}...\nCommand: ${item.install_command}\n`);
    try {
      const result = await invoke<TerminalResult>('install_setup_dependency', { dependencyId: item.id });
      setSetupOutput((current) => `${current}${formatTerminalResult(result)}\n`);
      if (result.success) {
        log('success', `${item.name} installer completed. Restart Diligent Code Studio if PATH changed.`);
      } else {
        log('warn', `${item.name} installer exited with code ${result.exit_code}. Review Setup output.`);
      }
      await refreshSetupDependencies();
    } catch (error) {
      setSetupOutput((current) => `${current}[${nowStamp()}] Install failed for ${item.name}: ${String(error)}\n`);
      log('error', `Install failed for ${item.name}: ${String(error)}`);
    } finally {
      setSetupInstallBusyId('');
    }
  }

  async function openSetupDependencyWebsite(item: SetupDependency) {
    if (!item.website) return;
    try {
      await invoke('open_external_url', { url: item.website });
      log('info', `Opened ${item.name} website.`);
    } catch (error) {
      log('error', `Could not open ${item.name} website: ${String(error)}`);
    }
  }


  async function openOpenSourceCredit(credit: OpenSourceCredit) {
    try {
      await invoke('open_external_url', { url: credit.website });
      log('info', `Opened open-source project website: ${credit.name}.`);
    } catch (error) {
      log('error', `Could not open ${credit.name} website: ${String(error)}`);
    }
  }

  async function refreshProjectDetection(path = workspacePath) {
    const trimmed = path.trim();
    if (!trimmed) return;

    try {
      const result = await invoke<ProjectInfo>('detect_project', { path: trimmed });
      setProjectInfo(result);
      log('success', `Project detected: ${result.project_types.join(', ')}.`);
      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => log('warn', warning));
      }
    } catch (error) {
      setProjectInfo(null);
      log('error', `Project detection failed: ${String(error)}`);
    }
  }

  async function refreshWorkspace(path = workspacePath, clearCollapsed = false): Promise<WorkspaceEntry[]> {
    const trimmed = path.trim();
    if (!trimmed) {
      log('warn', 'Choose or type a workspace folder first.');
      return [];
    }

    const result = await invoke<WorkspaceEntry[]>('list_workspace', { path: trimmed });
    setEntries(result);
    setWorkspacePath(trimmed);
    if (preferences.rememberLastWorkspace) {
      setPreferences((current) => ({ ...current, lastWorkspacePath: trimmed }));
    }

    if (clearCollapsed) {
      if (preferences.rememberExpandedFolders) {
        try {
          const raw = window.localStorage.getItem(collapsedStorageKey(trimmed));
          const saved = raw ? JSON.parse(raw) as string[] : [];
          setCollapsedDirectories(new Set(Array.isArray(saved) ? saved : []));
        } catch {
          setCollapsedDirectories(new Set());
        }
      } else {
        setCollapsedDirectories(new Set());
      }
    }

    setSelectedEntry((current) => {
      if (!current) return null;
      return result.find((entry) => entry.path === current.path) ?? null;
    });

    return result;
  }

  async function openWorkspace(path = workspacePath) {
    const trimmed = path.trim();
    try {
      const result = await refreshWorkspace(trimmed, true);
      setTerminalCwd(trimmed);
      if (result.length > 0 || trimmed) {
        log('success', `Workspace opened: ${trimmed}`);
        log('info', `Loaded ${result.length} visible project entries. Skipped build/cache folders such as node_modules, target, bin, obj, and .git.`);
        appendTerminal(`\nWorkspace set to: ${trimmed}\nTerminal folder set to: ${trimmed}\n`);
        await refreshProjectDetection(trimmed);
        await refreshToolStatus();
        await refreshGitStatus(trimmed, false);
      }
    } catch (error) {
      log('error', `Could not open workspace: ${String(error)}`);
    }
  }

  async function chooseWorkspaceFolder() {
    try {
      const selected = await invoke<string | null>('pick_workspace_folder');
      if (!selected) {
        log('info', 'Folder selection cancelled.');
        return;
      }
      await openWorkspace(selected);
    } catch (error) {
      log('error', `Native folder picker failed: ${String(error)}`);
    }
  }

  async function chooseTerminalFolder() {
    try {
      const selected = await invoke<string | null>('pick_workspace_folder');
      if (!selected) {
        log('info', 'Terminal folder selection cancelled.');
        return;
      }
      setTerminalCwd(selected);
      appendTerminal(`\nTerminal folder set to: ${selected}\n`);
      log('success', `Terminal folder set: ${selected}`);
    } catch (error) {
      log('error', `Terminal folder picker failed: ${String(error)}`);
    }
  }

  function setTerminalToWorkspace() {
    setTerminalCwd(workspacePath);
    appendTerminal(`\nTerminal folder set to workspace: ${workspacePath}\n`);
    log('success', `Terminal folder set to workspace: ${workspacePath}`);
  }

  function setTerminalToSelectedFolder() {
    setTerminalCwd(targetDirectory);
    appendTerminal(`\nTerminal folder set to selected target: ${targetDirectory}\n`);
    log('success', `Terminal folder set to selected target: ${targetDirectory}`);
  }

  function toggleDirectory(entry: WorkspaceEntry) {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(entry.relative_path)) {
        next.delete(entry.relative_path);
      } else {
        next.add(entry.relative_path);
      }
      return next;
    });
  }

  async function openFileByPath(path: string) {
    try {
      const existing = openFiles.find((file) => file.path === path);
      if (existing) {
        setActivePath(path);
        setActivePage('editor');
        rememberRecentFile(path, existing.language);
        log('info', `Switched to open file: ${existing.name}`);
        return;
      }

      const content = await invoke<string>('read_text_file', { path });
      const sha256 = await invoke<string>('calculate_sha256', { path });
      const name = basename(path);

      setOpenFiles((current) => [
        ...current,
        {
          path,
          name,
          language: languageFromPath(path),
          content,
          dirty: false,
          sha256,
        },
      ]);
      setActivePath(path);
      setActivePage('editor');
      rememberRecentFile(path, languageFromPath(path));
      log('info', `Opened file: ${name}`);
    } catch (error) {
      log('error', `Could not open file: ${String(error)}`);
    }
  }

  async function openEntry(entry: WorkspaceEntry) {
    setSelectedEntry(entry);

    if (entry.is_dir) {
      toggleDirectory(entry);
      return;
    }

    await openFileByPath(entry.path);
  }

  async function saveActiveFile() {
    if (!activeFile) return;
    try {
      await invoke('write_text_file', { path: activeFile.path, contents: activeFile.content });
      const sha256 = await invoke<string>('calculate_sha256', { path: activeFile.path });
      setOpenFiles((current) =>
        current.map((file) =>
          file.path === activeFile.path ? { ...file, dirty: false, sha256 } : file,
        ),
      );
      log('success', `Saved file: ${activeFile.name}`);
    } catch (error) {
      log('error', `Save failed: ${String(error)}`);
    }
  }

  async function saveActiveFileAs() {
    if (!activeFile) return;
    try {
      const savedPath = await invoke<string | null>('save_text_file_as', {
        suggested: activeFile.name,
        contents: activeFile.content,
      });

      if (!savedPath) {
        log('info', 'Save As cancelled.');
        return;
      }

      const sha256 = await invoke<string>('calculate_sha256', { path: savedPath });
      const name = basename(savedPath);

      setOpenFiles((current) => {
        const withoutDuplicate = current.filter((file) => file.path !== savedPath && file.path !== activeFile.path);
        return [
          ...withoutDuplicate,
          {
            ...activeFile,
            path: savedPath,
            name,
            language: languageFromPath(savedPath),
            dirty: false,
            sha256,
          },
        ];
      });
      setActivePath(savedPath);
      await refreshWorkspace();
      log('success', `Saved file as: ${savedPath}`);
    } catch (error) {
      log('error', `Save As failed: ${String(error)}`);
    }
  }

  async function hashActiveFile() {
    if (!activeFile) return;
    try {
      const sha256 = await invoke<string>('calculate_sha256', { path: activeFile.path });
      setOpenFiles((current) =>
        current.map((file) => (file.path === activeFile.path ? { ...file, sha256 } : file)),
      );
      log('success', `SHA-256 for ${activeFile.name}: ${sha256}`);
    } catch (error) {
      log('error', `Hash failed: ${String(error)}`);
    }
  }

  function updateActiveContent(value?: string) {
    if (!activeFile) return;
    setOpenFiles((current) =>
      current.map((file) =>
        file.path === activeFile.path
          ? { ...file, content: value ?? '', dirty: file.content !== (value ?? '') }
          : file,
      ),
    );
  }


  function handleEditorBeforeMount(monaco: any) {
    registerDiligentLanguages(monaco);
  }

  function handleEditorMount(editor: any, monaco?: any) {
    registerDiligentLanguages(monaco);
    editorRef.current = editor;
    const position = editor.getPosition?.();
    if (position) {
      setCursorPosition({ lineNumber: position.lineNumber, column: position.column });
    }

    editor.onDidChangeCursorPosition((event: any) => {
      setCursorPosition({ lineNumber: event.position.lineNumber, column: event.position.column });
    });
  }

  function formatActiveDocument() {
    if (!activeFile || !editorRef.current) {
      log('warn', 'Open a file before formatting.');
      return;
    }

    const formatAction = editorRef.current.getAction?.('editor.action.formatDocument');
    if (!formatAction) {
      log('warn', `No formatter is available for ${activeFile.name} yet.`);
      return;
    }

    try {
      void formatAction.run();
      log('info', `Format Document requested for ${activeFile.name}. Save the file if formatting changed it.`);
    } catch (error) {
      log('warn', `Format Document is not available for this file type yet: ${String(error)}`);
    }
  }

  function selectFindMatch(index: number) {
    if (!activeFile || currentFileFindMatches.length === 0) {
      log('warn', 'No current-file find matches to select.');
      return;
    }

    const normalizedIndex = ((index % currentFileFindMatches.length) + currentFileFindMatches.length) % currentFileFindMatches.length;
    const match = currentFileFindMatches[normalizedIndex];
    setActiveFindIndex(normalizedIndex);

    const editor = editorRef.current;
    if (editor) {
      editor.setSelection({
        startLineNumber: match.lineNumber,
        startColumn: match.column,
        endLineNumber: match.lineNumber,
        endColumn: match.column + findQuery.length,
      });
      editor.revealLineInCenter(match.lineNumber);
      editor.focus();
    }
  }

  function findNext() {
    if (!findQuery.trim()) {
      log('warn', 'Type text in Find before using Next.');
      return;
    }
    selectFindMatch(activeFindIndex + 1);
  }

  function findPrevious() {
    if (!findQuery.trim()) {
      log('warn', 'Type text in Find before using Previous.');
      return;
    }
    selectFindMatch(activeFindIndex - 1);
  }

  function replaceCurrentMatch() {
    if (!activeFile) {
      log('warn', 'Open a file before using Replace.');
      return;
    }

    if (!findQuery) {
      log('warn', 'Type text in Find before using Replace.');
      return;
    }

    if (currentFileFindMatches.length === 0) {
      log('warn', 'No current-file matches found to replace.');
      return;
    }

    const match = currentFileFindMatches[Math.min(activeFindIndex, currentFileFindMatches.length - 1)];
    const nextContent = `${activeFile.content.slice(0, match.start)}${replaceText}${activeFile.content.slice(match.end)}`;
    updateActiveContent(nextContent);
    log('success', `Replaced one match in ${activeFile.name}. Save the file to write changes to disk.`);
  }

  function replaceAllMatches() {
    if (!activeFile) {
      log('warn', 'Open a file before using Replace All.');
      return;
    }

    if (!findQuery) {
      log('warn', 'Type text in Find before using Replace All.');
      return;
    }

    if (currentFileFindMatches.length === 0) {
      log('warn', 'No current-file matches found to replace.');
      return;
    }

    const confirmed = window.confirm(
      `Replace ${currentFileFindMatches.length} match${currentFileFindMatches.length === 1 ? '' : 'es'} in ${activeFile.name}?\n\nThis updates the open editor buffer. Click Save afterward to write changes to disk.`,
    );

    if (!confirmed) {
      log('info', 'Replace All cancelled.');
      return;
    }

    let output = '';
    let cursor = 0;
    currentFileFindMatches.forEach((match) => {
      output += activeFile.content.slice(cursor, match.start);
      output += replaceText;
      cursor = match.end;
    });
    output += activeFile.content.slice(cursor);

    updateActiveContent(output);
    log('success', `Replaced ${currentFileFindMatches.length} match${currentFileFindMatches.length === 1 ? '' : 'es'} in ${activeFile.name}. Save the file to write changes to disk.`);
  }

  function closeFile(path: string) {
    const closingFile = openFiles.find((file) => file.path === path);
    if (closingFile?.dirty) {
      const confirmed = window.confirm(`Close ${closingFile.name} without saving changes?`);
      if (!confirmed) {
        log('info', `Close cancelled for unsaved file: ${closingFile.name}`);
        return;
      }
    }

    const nextFiles = openFiles.filter((file) => file.path !== path);
    setOpenFiles(nextFiles);
    if (activePath === path) {
      setActivePath(nextFiles[nextFiles.length - 1]?.path ?? null);
    }
  }

  async function createNewFile() {
    const defaultName = 'untitled.txt';
    const name = window.prompt(`Create new file in:\n${targetDirectory}`, defaultName);
    if (!name) {
      log('info', 'New file cancelled.');
      return;
    }

    try {
      const newPath = await invoke<string>('create_text_file', {
        parent: targetDirectory,
        name,
        contents: '',
      });
      await refreshWorkspace();
      await refreshProjectDetection();
      await openFileByPath(newPath);
      log('success', `Created file: ${newPath}`);
    } catch (error) {
      log('error', `New file failed: ${String(error)}`);
    }
  }

  async function createNewFolder() {
    const name = window.prompt(`Create new folder in:\n${targetDirectory}`, 'NewFolder');
    if (!name) {
      log('info', 'New folder cancelled.');
      return;
    }

    try {
      const newPath = await invoke<string>('create_folder', {
        parent: targetDirectory,
        name,
      });
      await refreshWorkspace();
      await refreshProjectDetection();
      log('success', `Created folder: ${newPath}`);
    } catch (error) {
      log('error', `New folder failed: ${String(error)}`);
    }
  }

  async function renameSelectedEntry() {
    if (!selectedEntry) {
      log('warn', 'Select a file or folder before using Rename.');
      return;
    }

    const name = window.prompt('Rename selected item:', selectedEntry.name);
    if (!name || name === selectedEntry.name) {
      log('info', 'Rename cancelled.');
      return;
    }

    try {
      const oldPath = selectedEntry.path;
      const newPath = await invoke<string>('rename_path', { path: oldPath, name });
      const newName = basename(newPath);

      if (selectedEntry.is_dir) {
        setOpenFiles((current) => current.filter((file) => !isSameOrChildPath(file.path, oldPath)));
        if (activePath && isSameOrChildPath(activePath, oldPath)) {
          setActivePath(null);
        }
        log('warn', 'Closed open tabs that were inside the renamed folder.');
      } else {
        setOpenFiles((current) =>
          current.map((file) =>
            file.path === oldPath
              ? {
                  ...file,
                  path: newPath,
                  name: newName,
                  language: languageFromPath(newPath),
                }
              : file,
          ),
        );
        if (activePath === oldPath) {
          setActivePath(newPath);
        }
      }

      setSelectedEntry(null);
      await refreshWorkspace();
      await refreshProjectDetection();
      log('success', `Renamed to: ${newPath}`);
    } catch (error) {
      log('error', `Rename failed: ${String(error)}`);
    }
  }

  async function deleteSelectedEntry() {
    if (!selectedEntry) {
      log('warn', 'Select a file or folder before using Delete.');
      return;
    }

    const confirmed = window.confirm(
      `Delete this ${selectedEntry.is_dir ? 'folder and all contents' : 'file'}?\n\n${selectedEntry.path}`,
    );
    if (!confirmed) {
      log('info', 'Delete cancelled.');
      return;
    }

    try {
      const deletedPath = selectedEntry.path;
      const deletingFolder = selectedEntry.is_dir;
      await invoke('delete_path', { path: deletedPath });

      const nextOpenFiles = openFiles.filter((file) =>
        deletingFolder ? !isSameOrChildPath(file.path, deletedPath) : file.path !== deletedPath,
      );
      setOpenFiles(nextOpenFiles);

      if (activePath && (deletingFolder ? isSameOrChildPath(activePath, deletedPath) : activePath === deletedPath)) {
        setActivePath(nextOpenFiles[nextOpenFiles.length - 1]?.path ?? null);
      }

      setSelectedEntry(null);
      await refreshWorkspace();
      await refreshProjectDetection();
      log('success', `Deleted: ${deletedPath}`);
    } catch (error) {
      log('error', `Delete failed: ${String(error)}`);
    }
  }

  async function manualRefresh() {
    try {
      const result = await refreshWorkspace();
      await refreshProjectDetection();
      await refreshToolStatus();
      await refreshGitStatus(workspacePath, false);
      log('success', `Explorer refreshed: ${result.length} entries loaded.`);
    } catch (error) {
      log('error', `Refresh failed: ${String(error)}`);
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query) {
      log('warn', 'Type search text before running Search Across Files.');
      return;
    }

    try {
      setSearchRunning(true);
      const result = await invoke<SearchResult[]>('search_workspace', {
        workspacePath,
        query,
        caseSensitive: searchCaseSensitive,
        wholeWord: searchWholeWord,
        extensionFilter: searchExtensionFilter,
      });
      setSearchResults(result);
      log('success', `Search complete: ${result.length} match${result.length === 1 ? '' : 'es'} for "${query}".`);
    } catch (error) {
      log('error', `Search failed: ${String(error)}`);
    } finally {
      setSearchRunning(false);
    }
  }

  async function openSearchResult(result: SearchResult) {
    await openFileByPath(result.path);
    setActivePage('editor');
    setSelectedEntry(entries.find((entry) => entry.path === result.path) ?? null);
    log('info', `Search result opened: ${result.relative_path}:${result.line_number}:${result.column}`);
  }

  function clearSearch() {
    setSearchResults([]);
    setSearchQuery('');
    log('info', 'Search results cleared.');
  }


  async function runDiagnostics() {
    if (!workspacePath.trim()) {
      log('warn', 'Choose a workspace before running diagnostics.');
      return;
    }

    setDiagnosticsBusy(true);
    const startedAt = Date.now();
    setDiagnosticsOutput(verboseCommandHeader('Diagnostics started', workspacePath, 'npm build and cargo check when applicable', preferences.terminalShell));
    const heartbeat = window.setInterval(() => {
      setDiagnosticsOutput((current) => `${current}[${nowStamp()}] Diagnostics still running... elapsed ${elapsedSeconds(startedAt)}s.
`);
    }, 5000);

    try {
      const result = await invoke<DiagnosticRunResult>('run_diagnostics', {
        workspacePath,
        shell: preferences.terminalShell,
      });
      setDiagnostics(result);
      setDiagnosticsOutput((current) => `${current}[${nowStamp()}] Diagnostics completed after ${elapsedSeconds(startedAt)}s.

${result.output || 'Diagnostics completed without output.\n'}`);
      result.messages.forEach((message) => log(result.error_count > 0 ? 'warn' : 'success', message));
      await refreshProjectDetection(workspacePath);
    } catch (error) {
      const message = String(error);
      setDiagnostics(null);
      setDiagnosticsOutput((current) => `${current}[${nowStamp()}] Diagnostics failed after ${elapsedSeconds(startedAt)}s.
ERROR: ${message}
`);
      log('error', `Diagnostics failed: ${message}`);
    } finally {
      window.clearInterval(heartbeat);
      setDiagnosticsBusy(false);
    }
  }

  async function openDiagnosticProblem(problem: DiagnosticProblem) {
    if (!problem.file_path) {
      log('warn', 'This diagnostic did not include a file path. Review the raw diagnostic output.');
      return;
    }

    await openFileByPath(problem.file_path);
    setActivePage('editor');
    setSelectedEntry(entries.find((entry) => entry.path === problem.file_path) ?? null);
    log('info', `Opened diagnostic: ${problem.relative_path || problem.file_path}:${problem.line_number || 1}:${problem.column || 1}`);
  }

  function clearDiagnostics() {
    setDiagnostics(null);
    setDiagnosticsOutput('Problems cleared. Run diagnostics to refresh.\n');
    log('info', 'Problems page cleared.');
  }


  function projectContextText(): string {
    const fileEntries = entries
      .filter((entry) => !entry.is_dir)
      .slice(0, 200)
      .map((entry) => `- ${entry.relative_path} (${formatSize(entry.size)})`);

    const folderEntries = entries
      .filter((entry) => entry.is_dir && entry.depth <= 2)
      .slice(0, 80)
      .map((entry) => `- ${entry.relative_path}/`);

    const openFileSummary = openFiles.map((file) => `- ${file.name} | ${file.language} | ${file.dirty ? 'unsaved changes' : 'saved'} | ${file.path}`);

    const projectSummary = projectInfo
      ? [
          `Detected project path: ${projectInfo.path}`,
          `Project types: ${projectInfo.project_types.join(', ') || 'Unknown'}`,
          `package.json: ${projectInfo.has_package_json ? 'yes' : 'no'}`,
          `Cargo.toml: ${projectInfo.has_cargo_toml ? 'yes' : 'no'}`,
          `Tauri project: ${projectInfo.has_tauri_project ? 'yes' : 'no'}`,
          `C# solution: ${projectInfo.has_solution ? 'yes' : 'no'}`,
          `C# project: ${projectInfo.has_csproj ? 'yes' : 'no'}`,
          `PowerShell scripts: ${projectInfo.has_powershell_scripts ? 'yes' : 'no'}`,
          `Git repository: ${projectInfo.has_git_repository ? 'yes' : 'no'}`,
          projectInfo.cargo_working_directory ? `Cargo working directory: ${projectInfo.cargo_working_directory}` : '',
          projectInfo.recommended_commands.length > 0 ? `Recommended commands:\n${projectInfo.recommended_commands.map((cmd) => `- ${cmd}`).join('\n')}` : '',
          projectInfo.warnings.length > 0 ? `Project warnings:\n${projectInfo.warnings.map((warning) => `- ${warning}`).join('\n')}` : '',
        ].filter(Boolean).join('\n')
      : 'No project has been detected yet.';

    const gitSummary = gitStatus
      ? [
          `Git root: ${gitStatus.git_root}`,
          `Branch: ${gitStatus.branch}`,
          `Ahead/behind: ${gitStatus.ahead_behind || 'none'}`,
          `Clean: ${gitStatus.clean ? 'yes' : 'no'}`,
          gitStatus.changed_files.length > 0 ? `Changed files:\n${gitStatus.changed_files.slice(0, 80).map((file) => `- ${file.status} ${file.path}${file.staged ? ' [staged]' : ''}${file.unstaged ? ' [unstaged]' : ''}`).join('\n')}` : 'Changed files: none',
          gitStatus.recent_commits.length > 0 ? `Recent commits:\n${gitStatus.recent_commits.slice(0, 8).map((commit) => `- ${commit.hash} ${commit.message}`).join('\n')}` : '',
        ].filter(Boolean).join('\n')
      : 'Git status has not been loaded.';

    const diagnosticsSummary = diagnostics
      ? [
          `Diagnostics exit code: ${diagnostics.exit_code}`,
          `Problems: ${diagnostics.problem_count} total, ${diagnostics.error_count} errors, ${diagnostics.warning_count} warnings`,
          diagnostics.problems.length > 0 ? `Top problems:\n${diagnostics.problems.slice(0, 30).map((problem) => `- ${problem.severity.toUpperCase()} ${problem.relative_path || problem.file_path}:${problem.line_number || 1}:${problem.column || 1} ${problem.message}`).join('\n')}` : 'Top problems: none',
        ].join('\n')
      : 'Diagnostics have not been run.';

    const releaseSummary = releaseInfo
      ? [
          `Release app version: ${releaseInfo.app_version || 'unknown'}`,
          `Tauri config: ${releaseInfo.has_tauri_config ? 'yes' : 'no'}`,
          `Bundle artifacts: ${releaseInfo.has_bundle_artifacts ? 'yes' : 'no'}`,
          `Bundle directory: ${releaseInfo.bundle_directory || 'not found'}`,
          `Release root: ${releaseInfo.release_root || 'not set'}`,
          `Artifact count: ${releaseInfo.artifact_count}`,
          releaseInfo.warnings.length > 0 ? `Release warnings:\n${releaseInfo.warnings.map((warning) => `- ${warning}`).join('\n')}` : '',
        ].filter(Boolean).join('\n')
      : 'Release information has not been loaded.';

    return [
      `Active screen: ${activePageTitle}`,
      `Workspace path: ${workspacePath || 'not selected'}`,
      '',
      'PROJECT DETECTION',
      projectSummary,
      '',
      'ACTIVE FILE',
      activeFile ? `${activeFile.path}\nLanguage: ${formatLanguageLabel(activeFile.language)}\nUnsaved changes: ${activeFile.dirty ? 'yes' : 'no'}\nContent preview:\n${activeFile.content.slice(0, 8000)}` : 'No active file is open.',
      '',
      'OPEN FILES',
      openFileSummary.length > 0 ? openFileSummary.join('\n') : 'No open files.',
      '',
      'WORKSPACE FOLDERS',
      folderEntries.length > 0 ? folderEntries.join('\n') : 'No folders loaded.',
      '',
      'WORKSPACE FILES',
      fileEntries.length > 0 ? fileEntries.join('\n') : 'No files loaded.',
      '',
      'GIT STATUS',
      gitSummary,
      '',
      'DIAGNOSTICS',
      diagnosticsSummary,
      '',
      'RECENT TERMINAL OUTPUT',
      terminalOutput.slice(-6000) || 'No terminal output is available.',
      '',
      'RELEASE STATUS',
      releaseSummary,
    ].join('\n');
  }


  function aiContextText(): string {
    switch (aiContextMode) {
      case 'selection': {
        const selection = editorRef.current?.getSelection();
        const selectedText = selection ? editorRef.current?.getModel()?.getValueInRange(selection) ?? '' : '';
        if (selectedText.trim()) return `Selected code from ${activeFile?.path ?? 'current editor'}:\n\n${selectedText}`;
        return activeFile ? `No selection was active. Current file ${activeFile.path}:\n\n${activeFile.content}` : 'No active file or selected code.';
      }
      case 'currentFile':
        return activeFile ? `Current file ${activeFile.path}:\n\n${activeFile.content}` : 'No active file is open.';
      case 'project':
        return projectContextText();
      case 'problems':
        return diagnosticsOutput || 'No diagnostics output is available.';
      case 'terminal':
        return terminalOutput.slice(-12000) || 'No terminal output is available.';
      case 'git':
        return gitStatus ? JSON.stringify(gitStatus, null, 2) : 'No Git status has been loaded.';
      default:
        return '';
    }
  }

  function aiHelpContextText(): string {
    const projectTypes = projectInfo?.project_types?.join(', ') || 'Unknown';
    const activeFileLine = activeFile ? `${activeFile.path} (${formatLanguageLabel(activeFile.language)}, ${countLines(activeFile.content)} lines)` : 'No active file';
    return [
      `Current screen: ${activePageTitle}`,
      `Workspace: ${workspacePath || 'No workspace selected'}`,
      `Detected project type: ${projectTypes}`,
      `Active file: ${activeFileLine}`,
      `Open files: ${openFiles.length}`,
      `Git: ${projectInfo?.has_git_repository ? 'Repository detected' : 'No repository detected'}`,
      `Setup status: ${setupStats.total > 0 ? `${setupStats.installed}/${setupStats.total} tools detected` : 'Not checked yet'}`,
      '',
      'Use AI Help for app navigation and quick guidance. For full coding output, use the AI Coding Assistant workspace page.',
    ].join('\n');
  }

  function prepareAiHelpAction(action: string) {
    switch (action) {
      case 'navigate':
        setAiHelpPrompt('Help me understand this screen and what I should click next.');
        break;
      case 'project':
        setAiHelpPrompt('Give me a quick plain-English status summary of this project and what to do next.');
        break;
      case 'coding':
        setAiHelpPrompt('Tell me where to go in Diligent Code Studio for coding help, bug finding, README creation, installer scripts, or project summaries.');
        break;
      default:
        setAiHelpPrompt('How do I use this screen?');
        break;
    }
  }


  function selectedEditorText(): string {
    const selection = editorRef.current?.getSelection?.();
    const model = editorRef.current?.getModel?.();
    return selection && model ? model.getValueInRange(selection) ?? '' : '';
  }

  function prepareAiCodeAction(action: string) {
    const fileName = activeFile?.name ?? 'the current file';
    const language = activeFile ? formatLanguageLabel(activeFile.language) : 'unknown language';
    const hasSelection = selectedEditorText().trim().length > 0;

    switch (action) {
      case 'explain-selection':
        setAiContextMode('selection');
        setAiPrompt('Explain the selected code in plain English. Include what it does, important inputs/outputs, and any risky or confusing areas.');
        break;
      case 'review-current-file':
        setAiContextMode('currentFile');
        setAiPrompt(`Review ${fileName} (${language}) for bugs, security concerns, maintainability issues, and practical improvements. Give prioritized recommendations.`);
        break;
      case 'fix-problems':
        setAiContextMode('problems');
        setAiPrompt('Explain the diagnostics/build errors and provide a step-by-step fix plan. Mention exact files, line numbers, commands, and likely root cause when available.');
        break;
      case 'explain-terminal':
        setAiContextMode('terminal');
        setAiPrompt('Explain the most recent terminal output. Identify the error, likely cause, and exact commands or file edits to fix it.');
        break;
      case 'commit-message':
        setAiContextMode('git');
        setAiPrompt('Generate a concise professional Git commit message from the Git status. Include one short subject line and 2-4 optional bullet points.');
        break;
      case 'refactor-selection':
        setAiContextMode('selection');
        setAiPrompt('Suggest a safer, cleaner refactor for the selected code. Explain the changes first, then provide a replacement code block. Do not assume files were changed.');
        break;
      case 'add-comments':
        setAiContextMode(hasSelection ? 'selection' : 'currentFile');
        setAiPrompt('Generate helpful comments for the selected code or current file. Prefer concise comments that explain intent and non-obvious logic. Avoid noisy comments.');
        break;
      case 'unit-test':
        setAiContextMode(hasSelection ? 'selection' : 'currentFile');
        setAiPrompt('Suggest practical unit tests or validation steps for this code. Include edge cases, expected outcomes, and example test code when useful.');
        break;
      default:
        return;
    }

    setActivePage('ai');
    log('info', `Prepared AI code action: ${action}. Review the prompt in the AI Coding Assistant window, then click Ask AI.`);
  }

  function prepareProjectAiAction(action: string) {
    const fileName = activeFile?.name ?? 'the current file';
    const language = activeFile ? formatLanguageLabel(activeFile.language) : 'unknown language';
    const hasSelection = selectedEditorText().trim().length > 0;

    switch (action) {
      case 'ask-project':
        setAiContextMode('project');
        setAiPrompt('Ask AI about this project. Review the project structure, detected technologies, active file, diagnostics, Git status, terminal output, and release status. Tell me the best next steps and ask for any missing detail only if absolutely necessary.');
        break;
      case 'explain-current-file':
        setAiContextMode('currentFile');
        setAiPrompt(`Explain ${fileName} (${language}) in plain English. Include its purpose, important functions/components, data flow, dependencies, and where it fits in the project.`);
        break;
      case 'find-bugs':
        setAiContextMode(activeFile ? 'currentFile' : 'project');
        setAiPrompt(activeFile
          ? `Find bugs in ${fileName} (${language}). Look for runtime errors, broken UI behavior, async/state issues, edge cases, security concerns, and maintainability problems. Prioritize the fixes and include exact code changes when possible.`
          : 'Find likely bugs across this project using the available project context, diagnostics, terminal output, Git status, and file tree. Prioritize the fixes and include exact files to inspect first.');
        break;
      case 'improve-code':
        setAiContextMode(hasSelection ? 'selection' : activeFile ? 'currentFile' : 'project');
        setAiPrompt(hasSelection
          ? 'Improve this selected code. Make it cleaner, safer, easier to maintain, and more reliable. Explain the changes, then provide a replacement code block.'
          : activeFile
            ? `Improve ${fileName} (${language}). Suggest practical refactoring, layout, naming, error handling, and reliability improvements. Include replacement code only for the parts that should change.`
            : 'Improve this project based on the available project context. Recommend the highest-impact code, layout, build, and reliability improvements.');
        break;
      case 'generate-missing-file':
        setAiContextMode('project');
        setAiPrompt('Generate a missing file for this project. First identify the most likely missing file based on the project structure, diagnostics, terminal output, and release state. Then provide the exact relative path and complete file contents. If multiple files are needed, list them in the correct creation order.');
        break;
      case 'create-readme':
        setAiContextMode('project');
        setAiPrompt('Create a professional README.md for this project. Include overview, features, requirements, setup, development commands, build commands, release process, troubleshooting, security/privacy notes, and license/credits placeholders. Return complete Markdown ready to save as README.md.');
        break;
      case 'create-installer-script':
        setAiContextMode('project');
        setAiPrompt('Create an installer/build script for this project based on the detected technologies. Prefer a Windows PowerShell script if this is a Windows desktop app. Include prerequisite checks, clean build, npm build when needed, Tauri/.NET/Rust build when detected, installer artifact location, SHA-256 checksum generation, and clear success/failure messages. Return the complete script and recommended file path.');
        break;
      case 'summarize-project':
        setAiContextMode('project');
        setAiPrompt('Summarize this project for a developer who has never seen it. Include project purpose, technology stack, folder/file structure, key entry points, build/release workflow, known problems, next recommended improvements, and any risk areas.');
        break;
      default:
        return;
    }

    setActivePage('ai');
    log('info', `Prepared project-aware AI action: ${action}. Review the prompt in the AI Coding Assistant window, then click Ask AI.`);
  }


  function aiCommentText(text: string, language?: string): string {
    const cleaned = text.trim();
    if (!cleaned) return '';
    const lang = String(language || '').toLowerCase();

    if (['html', 'xml', 'markdown'].includes(lang)) {
      return `<!--\n${cleaned}\n-->`;
    }

    if (['powershell', 'shell', 'python', 'ruby', 'yaml', 'toml', 'ini'].includes(lang)) {
      return cleaned.split(/\r?\n/).map((line) => `# ${line}`).join('\n');
    }

    if (['batch'].includes(lang)) {
      return cleaned.split(/\r?\n/).map((line) => `REM ${line}`).join('\n');
    }

    return `/*\n${cleaned}\n*/`;
  }

  async function refreshOllamaModels() {
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    try {
      const status = await invoke<OllamaStatusInfo>('get_ollama_status', { endpoint: preferences.aiOllamaEndpoint });
      setOllamaStatus(status);
      setOllamaModels(status.models);

      if (status.models.length > 0 && !status.models.some((model) => model.name === preferences.aiOllamaModel)) {
        updatePreference('aiOllamaModel', status.models[0].name);
      }

      if (status.running && status.models.length > 0) {
        log('success', `Ollama is running. Loaded ${status.models.length} local model(s).`);
      } else if (status.running) {
        const message = 'Ollama is running, but no local models were found. Run: ollama pull llama3.2';
        setOllamaModelsError(message);
        log('warn', message);
      } else if (status.installed) {
        const message = 'Ollama appears to be installed, but the local service is not responding. Start Ollama, then click Refresh Models.';
        setOllamaModelsError(message);
        log('warn', message);
      } else {
        const message = 'Ollama was not found on PATH and the local API is not responding. Install/start Ollama, then click Refresh Models.';
        setOllamaModelsError(message);
        log('warn', message);
      }
    } catch (error) {
      const message = String(error);
      setOllamaModelsError(message);
      setOllamaModels([]);
      setOllamaStatus(null);
      log('warn', `Ollama model refresh failed: ${message}`);
    } finally {
      setOllamaModelsLoading(false);
    }
  }

  function insertAiResponseAsComment() {
    if (!activeFile || !aiResponse.trim()) return;
    const comment = aiCommentText(aiResponse, activeFile.language);
    const editor = editorRef.current;
    if (editor) {
      editor.executeEdits('diligent-ai-comment', [{
        range: editor.getSelection() ?? editor.getModel()!.getFullModelRange(),
        text: `${comment}\n`,
        forceMoveMarkers: true,
      }]);
    } else {
      updateActiveContent(`${activeFile.content}\n\n${comment}`);
    }
    log('info', 'Inserted AI response as a comment. Review before saving.');
  }

  async function askAi() {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      log('warn', 'Type an AI prompt first.');
      return;
    }

    if (preferences.aiProvider === 'disabled') {
      setActivePage('settings');
      log('warn', 'AI provider is disabled. Configure OpenAI or Ollama in Settings first.');
      return;
    }

    if (preferences.aiProvider === 'openai' && !preferences.aiOpenAiApiKey.trim()) {
      setActivePage('settings');
      log('warn', 'OpenAI API key is required before using the OpenAI provider.');
      return;
    }

    const context = aiContextText();
    if (preferences.aiRequireConfirmation) {
      const confirmed = window.confirm(`Send this prompt and ${aiContextMode} context to the configured AI provider?\n\nProvider: ${preferences.aiProvider}\nPrompt length: ${prompt.length} characters\nContext length: ${context.length} characters`);
      if (!confirmed) {
        log('warn', 'AI request cancelled before sending context.');
        return;
      }
    }

    setAiBusy(true);
    const startedAt = Date.now();
    setAiResponse(`[${nowStamp()}] AI request started...\nProvider: ${preferences.aiProvider}\nContext: ${aiContextMode}\n`);

    try {
      const result = await invoke<AiChatResponse>('ai_chat', {
        provider: preferences.aiProvider,
        apiKey: preferences.aiOpenAiApiKey,
        model: preferences.aiProvider === 'openai' ? preferences.aiOpenAiModel : preferences.aiOllamaModel,
        endpoint: preferences.aiOllamaEndpoint,
        prompt,
        context,
      });

      setAiResponse([
        `[${nowStamp()}] AI response returned after ${elapsedSeconds(startedAt)}s.`,
        `Provider: ${result.provider}`,
        `Model: ${result.model}`,
        '',
        result.response,
      ].join('\n'));
      log('success', `AI response received from ${result.provider} using ${result.model}.`);
    } catch (error) {
      setAiResponse(`[${nowStamp()}] AI request failed after ${elapsedSeconds(startedAt)}s.\nERROR: ${String(error)}\n`);
      log('error', `AI request failed: ${String(error)}`);
    } finally {
      setAiBusy(false);
    }
  }

  async function askAiHelp() {
    const prompt = aiHelpPrompt.trim();
    if (!prompt) {
      log('warn', 'Type an AI Help prompt first.');
      return;
    }

    if (preferences.aiProvider === 'disabled') {
      setAiHelpResponse('AI Help cannot send a request because AI is disabled. Open Settings and choose OpenAI or Ollama first.\n');
      setActivePage('settings');
      log('warn', 'AI provider is disabled. Configure OpenAI or Ollama in Settings first.');
      return;
    }

    if (preferences.aiProvider === 'openai' && !preferences.aiOpenAiApiKey.trim()) {
      setAiHelpResponse('AI Help cannot send a request because the OpenAI API key is missing. Open Settings and enter a session-only API key, or switch to Ollama.\n');
      setActivePage('settings');
      log('warn', 'OpenAI API key is required before using the OpenAI provider.');
      return;
    }

    const context = aiHelpContextText();
    if (preferences.aiRequireConfirmation) {
      const confirmed = window.confirm(`Send this AI Help prompt and screen context to the configured AI provider?\n\nProvider: ${preferences.aiProvider}\nPrompt length: ${prompt.length} characters\nContext length: ${context.length} characters`);
      if (!confirmed) {
        log('warn', 'AI Help request cancelled before sending context.');
        return;
      }
    }

    setAiBusy(true);
    const startedAt = Date.now();
    setAiHelpResponse(`[${nowStamp()}] AI Help request started...\nProvider: ${preferences.aiProvider}\nContext: Current screen + workspace summary\n`);

    try {
      const result = await invoke<AiChatResponse>('ai_chat', {
        provider: preferences.aiProvider,
        apiKey: preferences.aiOpenAiApiKey,
        model: preferences.aiProvider === 'openai' ? preferences.aiOpenAiModel : preferences.aiOllamaModel,
        endpoint: preferences.aiOllamaEndpoint,
        prompt,
        context,
      });

      setAiHelpResponse([
        `[${nowStamp()}] AI Help response returned after ${elapsedSeconds(startedAt)}s.`,
        `Provider: ${result.provider}`,
        `Model: ${result.model}`,
        '',
        result.response,
      ].join('\n'));
      log('success', `AI Help response received from ${result.provider} using ${result.model}.`);
    } catch (error) {
      setAiHelpResponse(`[${nowStamp()}] AI Help request failed after ${elapsedSeconds(startedAt)}s.\nERROR: ${String(error)}\n`);
      log('error', `AI Help request failed: ${String(error)}`);
    } finally {
      setAiBusy(false);
    }
  }

  function insertAiResponseIntoEditor() {
    if (!activeFile || !aiResponse.trim()) return;
    const editor = editorRef.current;
    if (editor) {
      editor.executeEdits('diligent-ai-insert', [{ range: editor.getSelection() ?? editor.getModel()!.getFullModelRange(), text: aiResponse, forceMoveMarkers: true }]);
    } else {
      updateActiveContent(`${activeFile.content}\n\n${aiResponse}`);
    }
    log('info', 'Inserted AI response into the active editor. Review before saving.');
  }


  function prepareWebBuilderCommand(command: string) {
    const target = workspacePath.trim() || terminalCwd.trim();
    setTerminalCwd(target);
    setTerminalCommand(command);
    setActivePage('terminal');
    appendTerminal(`
[${nowStamp()}] Web Builder prepared command
Working directory: ${target || 'Not selected'}
Command: ${command}
Click Run in Terminal when ready.
`);
    log('info', `Web Builder prepared command: ${command}`);
  }

  async function runWebBuilderCommand(label: string, command: string) {
    const target = workspacePath.trim() || terminalCwd.trim();
    if (!target) {
      log('warn', 'Choose a workspace before running Web Builder commands.');
      return;
    }

    const confirmed = window.confirm(`Run Web Builder command?\n\n${label}\n${command}\n\nSome hosting/deployment CLIs may ask you to sign in or create project links.`);
    if (!confirmed) {
      log('warn', `Web Builder command cancelled: ${label}`);
      return;
    }

    setTerminalCwd(target);
    setTerminalCommand(command);
    setActivePage('terminal');
    await runTerminalCommand(command, true);
  }

  async function runTerminalCommand(command = terminalCommand, force = false) {
    const cleanCommand = command.trim();
    if (!cleanCommand) {
      log('warn', 'Type a terminal command first.');
      return;
    }

    const reason = commandBlockReason(cleanCommand);
    if (reason && !force) {
      const confirmed = window.confirm(`${reason}\n\nRun this command anyway?\n\n${cleanCommand}`);
      if (!confirmed) {
        log('warn', `Command cancelled by preflight check: ${cleanCommand}`);
        appendTerminal(`\nPreflight warning: ${reason}\nCommand cancelled: ${cleanCommand}\n`);
        return;
      }
    }

    setTerminalCollapsed(false);
    setTerminalCommand(cleanCommand);
    setTerminalRunning(true);
    const startedAt = Date.now();
    appendTerminal(verboseCommandHeader('Terminal command started', terminalCwd, cleanCommand, preferences.terminalShell));
    const heartbeat = window.setInterval(() => {
      appendTerminal(`[${nowStamp()}] Still running... elapsed ${elapsedSeconds(startedAt)}s.
`);
    }, 5000);

    try {
      const result = await invoke<TerminalResult>('run_terminal_command', {
        cwd: terminalCwd,
        command: cleanCommand,
        shell: preferences.terminalShell,
      });
      appendTerminal(`[${nowStamp()}] Terminal command returned after ${elapsedSeconds(startedAt)}s.
`);
      appendTerminal(formatTerminalResult(result));
      log(result.success ? 'success' : 'warn', `Terminal command finished with exit code ${result.exit_code}: ${cleanCommand}`);
      await refreshProjectDetection(workspacePath);
      if (cleanCommand.toLowerCase().startsWith('git')) {
        await refreshGitStatus(workspacePath, false);
      }
    } catch (error) {
      appendTerminal(`[${nowStamp()}] Terminal command failed after ${elapsedSeconds(startedAt)}s.
ERROR: ${String(error)}
`);
      log('error', `Terminal command failed: ${String(error)}`);
    } finally {
      window.clearInterval(heartbeat);
      setTerminalRunning(false);
    }
  }


  function updateRegistryDraft<K extends keyof ToolRegistryItem>(key: K, value: ToolRegistryItem[K]) {
    setRegistryDraft((current) => ({ ...current, [key]: value }));
  }

  function addCustomRegistryTool() {
    const name = registryDraft.name.trim();
    const command = registryDraft.command.trim();
    if (!name || !command) {
      log('warn', 'Enter a tool name and command before adding it to the registry.');
      return;
    }

    const newItem: ToolRegistryItem = {
      ...registryDraft,
      id: `custom-tool-${Date.now()}`,
      name,
      category: registryDraft.category.trim() || 'Custom',
      command,
      description: registryDraft.description.trim(),
      enabled: true,
      builtIn: false,
    };

    setToolRegistryItems((current) => [...current, newItem]);
    setRegistryDraft(newCustomRegistryDraft());
    log('success', `Added registry tool: ${newItem.name}`);
  }

  function toggleRegistryTool(id: string) {
    setToolRegistryItems((current) =>
      current.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item),
    );
  }

  function removeRegistryTool(id: string) {
    const item = toolRegistryItems.find((tool) => tool.id === id);
    if (!item || item.builtIn) return;
    const confirmed = window.confirm(`Remove this custom registry tool?\n\n${item.name}`);
    if (!confirmed) return;
    setToolRegistryItems((current) => current.filter((tool) => tool.id !== id));
    log('info', `Removed registry tool: ${item.name}`);
  }

  function resetToolRegistry() {
    const confirmed = window.confirm('Reset the Tool Registry to the built-in defaults? Custom tools will be removed.');
    if (!confirmed) return;
    setToolRegistryItems(DEFAULT_TOOL_REGISTRY);
    setRegistryCategoryFilter('All');
    setRegistryDraft(newCustomRegistryDraft());
    log('info', 'Tool Registry reset to built-in defaults.');
  }

  async function runRegistryTool(item: ToolRegistryItem) {
    if (!item.enabled) {
      log('warn', `Tool Registry item is disabled: ${item.name}`);
      return;
    }
    setActivePage('terminal');
    log('info', `Running registry tool: ${item.name}`);
    await runTerminalCommand(item.command, true);
  }

  async function copyRegistryCommand(item: ToolRegistryItem) {
    try {
      await navigator.clipboard.writeText(item.command);
      log('success', `Copied registry command: ${item.name}`);
    } catch {
      log('warn', `Could not copy command automatically. Command: ${item.command}`);
    }
  }

  async function refreshGitStatus(path = workspacePath, showErrors = true) {
    const trimmed = path.trim();
    if (!trimmed) {
      setGitStatus(null);
      setGitError('Choose a workspace folder before refreshing Git status.');
      if (showErrors) log('warn', 'Choose a workspace folder before refreshing Git status.');
      return;
    }

    try {
      setGitLoading(true);
      setGitError('');
      const result = await invoke<GitStatusInfo>('git_status', { workspacePath: trimmed });
      setGitStatus(result);
      setGitError('');
      log(result.clean ? 'success' : 'info', `Git status refreshed: ${result.clean ? 'clean working tree' : `${result.changed_files.length} changed file(s)`}.`);
    } catch (error) {
      const message = String(error);
      setGitStatus(null);
      setGitError(message);
      if (showErrors) {
        log('warn', `Git status unavailable: ${message}`);
      }
    } finally {
      setGitLoading(false);
    }
  }

  async function runGitAction(action: string, invokeName: string, payload: Record<string, unknown>, successMessage: string) {
    try {
      setGitLoading(true);
      setGitError('');
      const result = await invoke<GitStatusInfo>(invokeName, payload);
      setGitStatus(result);
      setGitError('');
      await refreshProjectDetection(workspacePath);
      log('success', successMessage);
    } catch (error) {
      const message = String(error);
      setGitError(message);
      log('error', `${action} failed: ${message}`);
    } finally {
      setGitLoading(false);
    }
  }

  function gitFilePath(file: GitChangedFile): string {
    const path = file.path;
    if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\') || path.startsWith('/')) {
      return path;
    }
    const root = gitStatus?.git_root || workspacePath;
    const separator = root.includes('\\') ? '\\' : '/';
    return `${root.replace(/[\\/]+$/, '')}${separator}${path}`;
  }

  async function openGitFile(file: GitChangedFile) {
    await openFileByPath(gitFilePath(file));
    setSelectedEntry(entries.find((entry) => entry.path === gitFilePath(file)) ?? null);
  }

  async function initializeGitRepository() {
    const confirmed = window.confirm(`Initialize a Git repository in this workspace?\n\n${workspacePath}`);
    if (!confirmed) {
      log('info', 'Git initialization cancelled.');
      return;
    }
    await runGitAction('Initialize Git', 'git_init', { workspacePath }, 'Initialized Git repository for this workspace.');
  }

  async function stageAllGitChanges() {
    await runGitAction('Stage all', 'git_stage_all', { workspacePath }, 'Staged all Git changes.');
  }

  async function stageGitFile(file: GitChangedFile) {
    await runGitAction('Stage file', 'git_stage_file', { workspacePath, filePath: file.path }, `Staged file: ${file.path}`);
  }

  async function unstageGitFile(file: GitChangedFile) {
    await runGitAction('Unstage file', 'git_unstage_file', { workspacePath, filePath: file.path }, `Unstaged file: ${file.path}`);
  }

  async function commitGitChanges() {
    const message = commitMessage.trim();
    if (!message) {
      log('warn', 'Type a commit message before committing.');
      return;
    }

    const confirmed = window.confirm(`Commit staged changes with this message?\n\n${message}`);
    if (!confirmed) {
      log('info', 'Git commit cancelled.');
      return;
    }

    await runGitAction('Commit', 'git_commit', { workspacePath, message }, `Created Git commit: ${message}`);
    setCommitMessage('');
  }

  async function createGitTag() {
    const cleanTag = tagName.trim();
    if (!cleanTag) {
      log('warn', 'Type a tag name before creating a Git tag.');
      return;
    }

    const confirmed = window.confirm(`Create Git tag?\n\n${cleanTag}`);
    if (!confirmed) {
      log('info', 'Git tag creation cancelled.');
      return;
    }

    await runGitAction('Create tag', 'git_create_tag', { workspacePath, tagName: cleanTag }, `Created Git tag: ${cleanTag}`);
    setTagName('');
  }

  async function refreshTemplates() {
    try {
      const result = await invoke<ProjectTemplate[]>('get_project_templates');
      setTemplates(result);
      if (result.length > 0 && !result.some((template) => template.id === selectedTemplateId)) {
        setSelectedTemplateId(result[0].id);
      }
      log('info', `Loaded ${result.length} project template(s).`);
    } catch (error) {
      log('error', `Could not load project templates: ${String(error)}`);
    }
  }

  async function chooseTemplateParentFolder() {
    try {
      const selected = await invoke<string | null>('pick_workspace_folder');
      if (!selected) {
        log('info', 'Project template parent folder selection cancelled.');
        return;
      }
      setTemplateParentPath(selected);
      log('info', `Template parent folder set: ${selected}`);
    } catch (error) {
      log('error', `Template parent picker failed: ${String(error)}`);
    }
  }

  async function createProjectFromTemplate() {
    if (!templateParentPath.trim()) {
      log('warn', 'Choose a parent folder before creating a project from a template.');
      return;
    }
    if (!newProjectName.trim()) {
      log('warn', 'Enter a project name before creating a project from a template.');
      return;
    }

    setTemplateBusy(true);
    setTemplateResult(null);
    try {
      const result = await invoke<ProjectTemplateResult>('create_project_from_template', {
        parentPath: templateParentPath.trim(),
        projectName: newProjectName.trim(),
        templateId: selectedTemplateId,
      });
      setTemplateResult(result);
      log('success', `Created project from template: ${result.project_path}`);
      if (window.confirm(`Project created successfully:
${result.project_path}

Open this project now?`)) {
        await openWorkspace(result.project_path);
        setActivePage('editor');
      }
    } catch (error) {
      log('error', `Project template creation failed: ${String(error)}`);
    } finally {
      setTemplateBusy(false);
    }
  }

  function appendReleaseOutput(text: string) {
    setReleaseOutput((current) => `${current}${text}`);
  }

  async function refreshReleaseInfo() {
    if (!workspacePath.trim()) {
      setReleaseInfo(null);
      appendReleaseOutput('Choose a workspace before refreshing release information.\n');
      return;
    }

    try {
      const result = await invoke<ReleaseInfo>('get_release_info', { workspacePath });
      setReleaseInfo(result);
      log('info', `Release info refreshed for version ${result.app_version}.`);
    } catch (error) {
      setReleaseInfo(null);
      appendReleaseOutput(`Release info error: ${String(error)}\n`);
      log('error', `Release info failed: ${String(error)}`);
    }
  }

  async function runReleaseCommand(label: string, command: string) {
    if (!workspacePath.trim()) {
      log('warn', 'Choose a workspace before running a release command.');
      return;
    }

    const confirmed = command.includes('tauri:build')
      ? window.confirm('Tauri Build may take a while and can fail if the running dev app locks files. Continue?')
      : true;
    if (!confirmed) {
      log('info', `${label} cancelled.`);
      return;
    }

    setReleaseBusy(true);
    const startedAt = Date.now();
    appendReleaseOutput(verboseCommandHeader(label, workspacePath, command, preferences.terminalShell));
    const heartbeat = window.setInterval(() => {
      appendReleaseOutput(`[${nowStamp()}] ${label} still running... elapsed ${elapsedSeconds(startedAt)}s.
`);
    }, 5000);

    try {
      const result = await invoke<TerminalResult>('run_terminal_command', {
        cwd: workspacePath,
        command,
        shell: preferences.terminalShell,
      });
      appendReleaseOutput(`[${nowStamp()}] ${label} returned after ${elapsedSeconds(startedAt)}s.
`);
      appendReleaseOutput(formatTerminalResult(result));
      log(result.success ? 'success' : 'warn', `${label} finished with exit code ${result.exit_code}.`);
      await refreshProjectDetection(workspacePath);
      await refreshReleaseInfo();
    } catch (error) {
      appendReleaseOutput(`[${nowStamp()}] ${label} failed after ${elapsedSeconds(startedAt)}s.
ERROR: ${String(error)}
`);
      log('error', `${label} failed: ${String(error)}`);
    } finally {
      window.clearInterval(heartbeat);
      setReleaseBusy(false);
    }
  }

  async function createReleasePackageFromArtifacts() {
    if (!workspacePath.trim()) {
      log('warn', 'Choose a workspace before creating a release package.');
      return;
    }

    const confirmed = window.confirm('Create a release folder, copy installer artifacts, generate SHA-256 checksums, write release notes, and create a ZIP package?');
    if (!confirmed) {
      log('info', 'Release package creation cancelled.');
      return;
    }

    setReleaseBusy(true);
    const startedAt = Date.now();
    appendReleaseOutput(`
[${nowStamp()}] Create Release Package
Workspace: ${workspacePath}
Mode: verbose
Status: scanning bundle artifacts and preparing release folder...
`);
    const heartbeat = window.setInterval(() => {
      appendReleaseOutput(`[${nowStamp()}] Create Package still running... elapsed ${elapsedSeconds(startedAt)}s.
`);
    }, 5000);

    try {
      const result = await invoke<ReleasePackageResult>('create_release_package', {
        workspacePath,
        releaseNotes,
      });
      setReleaseResult(result);
      appendReleaseOutput(`[${nowStamp()}] Create Package returned after ${elapsedSeconds(startedAt)}s.
`);
      appendReleaseOutput(`${result.messages.join('\n')}\n`);
      if (result.copied_files.length > 0) {
        appendReleaseOutput(`Copied files:
${result.copied_files.map((file) => `- ${file}`).join('\n')}\n`);
      }
      log('success', `Release package created: ${result.release_directory}`);
      await refreshReleaseInfo();
      await manualRefresh();
    } catch (error) {
      appendReleaseOutput(`[${nowStamp()}] Create Package failed after ${elapsedSeconds(startedAt)}s.
ERROR: ${String(error)}
`);
      log('error', `Release package failed: ${String(error)}`);
    } finally {
      window.clearInterval(heartbeat);
      setReleaseBusy(false);
    }
  }

  async function openReleaseFolder(path?: string) {
    const target = path || releaseResult?.release_directory || releaseInfo?.release_root;
    if (!target) {
      log('warn', 'No release folder is available to open yet.');
      return;
    }

    try {
      await invoke('open_release_folder', { path: target });
      log('success', `Opened release folder: ${target}`);
    } catch (error) {
      log('error', `Could not open release folder: ${String(error)}`);
    }
  }

  async function openExternalTerminal() {
    try {
      await invoke('open_powershell_window', { cwd: terminalCwd, shell: preferences.terminalShell });
      log('success', `Opened external terminal window: ${terminalCwd}`);
    } catch (error) {
      log('error', `Could not open external terminal: ${String(error)}`);
    }
  }

  async function copyTerminalOutput() {
    try {
      await navigator.clipboard.writeText(terminalOutput);
      log('success', 'Copied terminal output to clipboard.');
    } catch (error) {
      log('error', `Could not copy terminal output: ${String(error)}`);
    }
  }


  function beginAiHelpDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, textarea, input, select, a')) return;
    const panel = assistantPocketRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startPosition = clampFloatingPanelPosition({ left: rect.left, top: rect.top }, rect.width, rect.height);
    aiHelpDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: startPosition.left,
      startTop: startPosition.top,
      width: rect.width,
      height: rect.height,
    };
    setAiHelpDragging(true);
    setAiHelpPosition(startPosition);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveAiHelpDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = aiHelpDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextPosition = clampFloatingPanelPosition(
      {
        left: drag.startLeft + event.clientX - drag.startX,
        top: drag.startTop + event.clientY - drag.startY,
      },
      drag.width,
      drag.height,
    );
    setAiHelpPosition(nextPosition);
  }

  function endAiHelpDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = aiHelpDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    aiHelpDragRef.current = null;
    setAiHelpDragging(false);
    setAiHelpPosition((current) => {
      const panel = assistantPocketRef.current;
      const width = panel?.getBoundingClientRect().width ?? drag.width;
      const height = panel?.getBoundingClientRect().height ?? drag.height;
      const clamped = clampFloatingPanelPosition(current, width, height);
      saveAiHelpPosition(clamped);
      return clamped;
    });
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  function resetAiHelpPosition(): void {
    const nextPosition = defaultAiHelpPosition();
    const panel = assistantPocketRef.current;
    const rect = panel?.getBoundingClientRect();
    const clamped = clampFloatingPanelPosition(nextPosition, rect?.width ?? 380, rect?.height ?? 460);
    setAiHelpPosition(clamped);
    saveAiHelpPosition(clamped);
  }

  return (
    <main className={`app-shell v050-shell theme-${preferences.theme} ${preferences.compactMode ? 'compact-mode' : ''} mode-${preferences.interfaceMode} ${aiDockOpen ? 'assistant-open' : 'assistant-closed'}`}>
      <header className="app-top-appbar">
        <div className="app-top-title">
          <div className="app-top-logo"><ShieldCheck size={18} /></div>
          <div>
            <strong>Diligent Code Studio</strong>
            <span>Local-first AI development workbench Ã¢â‚¬Â¢ v0.7.0-dev</span>
          </div>
        </div>
        <div className="app-health-strip" aria-label="Project health summary">
          <span className={projectInfo ? 'ok' : 'missing'}>{projectInfo ? `Project: ${projectInfo.project_types.join(', ') || 'Detected'}` : 'Project: Not loaded'}</span>
          <span className={projectInfo?.has_git_repository ? 'ok' : 'missing'}>{projectInfo?.has_git_repository ? 'Git: Ready' : 'Git: Not detected'}</span>
          <span className={setupStats.missingRequired === 0 && setupStats.total > 0 ? 'ok' : 'missing'}>{setupStats.total > 0 ? `Setup: ${setupStats.installed}/${setupStats.total}` : 'Setup: Check needed'}</span>
          <span className={preferences.aiProvider !== 'disabled' ? 'ok' : 'missing'}>{preferences.aiProvider !== 'disabled' ? `AI: ${preferences.aiProvider}` : 'AI: Disabled'}</span>
        </div>
        <div className="app-top-actions">
          <button className="secondary-button" onClick={() => setHelpManualOpen(true)} title="Open the built-in PDF user manual"><ExternalLink size={14} /> Manual</button>
          <button className="secondary-button" onClick={() => setActivePage('setup')}><PackageCheck size={14} /> Setup</button>
          <button className={`secondary-button ${aiDockOpen ? 'active-toolbar-action' : ''}`} onClick={() => setAiDockOpen((current) => !current)}><Bot size={14} /> {aiDockOpen ? 'Close AI Help' : 'AI Help'}</button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon"><ShieldCheck size={24} /></div>
          <div>
            <h1>Diligent Code Studio</h1>
            <p className="brand-tagline">Secure software-building workbench</p>
            <p>Community Edition v0.7.0-dev</p>
          </div>
        </div>


        <section className="panel workspace-panel">
          <div className="panel-title"><FolderOpen size={16} /> Workspace</div>
          <input
            value={workspacePath}
            onChange={(event) => setWorkspacePath(event.target.value)}
            spellCheck={false}
            className="path-input"
          />
          <div className="workspace-actions">
            <button className="primary-button" onClick={chooseWorkspaceFolder}>
              <FolderOpen size={15} /> Choose Folder
            </button>
            <button className="secondary-button" onClick={manualRefresh}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          <div className="workspace-stats">
            <span>{workspaceStats.folders} folders</span>
            <span>{workspaceStats.files} files</span>
          </div>
        </section>

        <section className="panel file-actions-panel">
          <div className="panel-title"><FilePlus2 size={16} /> File Actions</div>
          <div className="file-action-grid">
            <button onClick={createNewFile}><FilePlus2 size={15} /> New File</button>
            <button onClick={createNewFolder}><FolderPlus size={15} /> New Folder</button>
            <button onClick={renameSelectedEntry} disabled={!selectedEntry}><Edit3 size={15} /> Rename</button>
            <button className="danger-button" onClick={deleteSelectedEntry} disabled={!selectedEntry}><Trash2 size={15} /> Delete</button>
          </div>
          <div className="selected-target" title={targetDirectory}>
            Target: {selectedEntry ? selectedEntry.name : basename(targetDirectory)}
          </div>
        </section>

        <section className="explorer-tools">
          <div className="search-box">
            <Search size={14} />
            <input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Filter files..."
              spellCheck={false}
            />
          </div>
        </section>

        <section className="file-tree">
          {shownEntries.length === 0 ? (
            <div className="empty-state">Choose a folder to load your project tree.</div>
          ) : (
            shownEntries.map((entry) => {
              const collapsed = entry.is_dir && collapsedDirectories.has(entry.relative_path);
              const selected = selectedEntry?.path === entry.path;
              return (
                <button
                  key={entry.path}
                  className={`tree-row ${entry.is_dir ? 'dir' : 'file'} ${selected ? 'selected' : ''}`}
                  title={entry.path}
                  onClick={() => openEntry(entry)}
                  style={{ paddingLeft: `${8 + entry.depth * 14}px` }}
                >
                  {entry.is_dir ? (
                    <ChevronRight className={`chevron ${collapsed ? '' : 'open'}`} size={14} />
                  ) : (
                    <span className="tree-indent" />
                  )}
                  {entry.is_dir ? <Folder size={15} /> : <FileCode2 size={15} />}
                  <span className="tree-label">{entry.name}</span>
                  {!entry.is_dir && <span className="tree-language">{languageLabelFromPath(entry.path)}</span>}
                  {!entry.is_dir && <span className="tree-meta">{formatSize(entry.size)}</span>}
                </button>
              );
            })
          )}
        </section>
      </aside>

      <section className="main-area page-mode">
        <header className="topbar workspace-menu-shell">
          <nav className="top-page-nav draggable-top-page-nav" aria-label="Workspace pages. Drag buttons to reorder.">
            {normalizePageOrder(preferences.menuPageOrder).map((page) => {
              const dropClass = dragOverMenuPage === page ? `drag-over drag-over-${dragOverMenuDropSide}` : '';
              return (
                <button
                  key={page}
                  data-workspace-page={page}
                  draggable={false}
                  className={`${activePage === page ? 'active' : ''} ${draggedMenuPage === page ? 'dragging' : ''} ${dropClass}`}
                  onClick={(event) => handleWorkspaceMenuClick(page, event)}
                  onPointerDown={(event) => handleMenuPointerDown(page, event)}
                  onPointerMove={handleMenuPointerMove}
                  onPointerUp={handleMenuPointerUp}
                  onPointerCancel={handleMenuPointerCancel}
                  title={`Drag left or right to reorder. Click to open ${workspacePageLabel(page)}.`}
                >
                  {workspacePageIcon(page)} <span>{workspacePageLabel(page)}</span>
                </button>
              );
            })}
          </nav>

          <div className="workspace-command-row">
            <div className="page-title-block">
              <h2>{activePageTitle}</h2>
            </div>
            <div className="toolbar">
              {unsavedFileCount > 0 && <span className="unsaved-pill">{unsavedFileCount} unsaved</span>}
              <button className="toolbar-action" onClick={saveActiveFile} disabled={!activeFile} title="Save active file">
                <Save size={14} /> <span>Save</span>
              </button>
              <button className="toolbar-action" onClick={saveActiveFileAs} disabled={!activeFile} title="Save active file as...">
                <SaveAll size={14} /> <span>Save As</span>
              </button>
              <button className="toolbar-action" onClick={formatActiveDocument} disabled={!activeFile} title="Format active document">
                <Wrench size={14} /> <span>Format</span>
              </button>
              <button className="toolbar-action" onClick={hashActiveFile} disabled={!activeFile} title="Generate SHA-256 for active file">
                <Hash size={14} /> <span>SHA</span>
              </button>
            </div>
          </div>
        </header>


        {activePage === 'start' && (
          <section className="page-content utility-page start-page">
            <div className="start-hero panel">
              <div>
                <div className="panel-title"><Rocket size={18} /> Start Here</div>
                <h2>What do you want to do?</h2>
                <p className="muted-note">Choose a guided path. Diligent Code Studio will move you to the right workspace and show the next step.</p>
              </div>
              <button className="secondary-button" onClick={() => setOnboardingOpen(true)}><BrainCircuit size={14} /> Open First Run Setup</button>
            </div>

            <div className="start-choice-grid">
              <button className="start-choice-card" onClick={() => completeOnboarding('templates')}>
                <LayoutTemplate size={22} />
                <strong>Build a desktop app</strong>
                <span>Create or open a project, then use Editor, AI, Terminal, and Release Builder.</span>
              </button>
              <button className="start-choice-card" onClick={() => completeOnboarding('web')}>
                <Globe2 size={22} />
                <strong>Build a website</strong>
                <span>Use Web Builder for local preview, LAN hosting, and public deployment helpers.</span>
              </button>
              <button className="start-choice-card" onClick={() => completeOnboarding('setup')}>
                <PackageCheck size={22} />
                <strong>Set up my computer</strong>
                <span>Check Node.js, Git, Rust, Tauri, GitHub CLI, web tools, and optional AI tools.</span>
              </button>
              <button className="start-choice-card" onClick={() => completeOnboarding('editor')}>
                <FolderOpen size={22} />
                <strong>Open an existing project</strong>
                <span>Choose a workspace folder, browse files, edit code, and save changes.</span>
              </button>
              <button className="start-choice-card" onClick={() => completeOnboarding('ai')}>
                <Bot size={22} />
                <strong>Use AI to help with code</strong>
                <span>Ask project-aware questions, find bugs, improve files, or generate missing content.</span>
              </button>
              <button className="start-choice-card" onClick={() => completeOnboarding('release')}>
                <Rocket size={22} />
                <strong>Create an installer or release</strong>
                <span>Validate, build, package, checksum, and prepare release notes.</span>
              </button>
              <button className="start-choice-card" onClick={() => completeOnboarding('credits')}>
                <ExternalLink size={22} />
                <strong>View open-source credits</strong>
                <span>Recognize the contributors and projects that helped make this software possible.</span>
              </button>
            </div>

            <div className="start-steps-grid">
              <section className="panel">
                <div className="panel-title"><CheckCircle2 size={16} /> Recommended first workflow</div>
                <ol className="getting-started-list">
                  <li><strong>Check Setup & Dependencies</strong><span>Make sure the needed tools are installed.</span></li>
                  <li><strong>Open or create a project</strong><span>Use Choose Folder or Project Templates.</span></li>
                  <li><strong>Use AI Help when unsure</strong><span>The AI Coding Assistant page can answer project and workflow questions.</span></li>
                  <li><strong>Build and test</strong><span>Use Terminal, Problems, and Project Dashboard.</span></li>
                  <li><strong>Create a release</strong><span>Use Release Builder when the project is ready.</span></li>
                </ol>
              </section>
              <section className="panel">
                <div className="panel-title"><BrainCircuit size={16} /> Beginner vs Advanced</div>
                <p className="muted-note">Beginner Mode adds guidance and emphasizes safe next steps. Advanced Mode keeps the same tools but reduces extra guidance and works better for experienced users.</p>
                <div className="segmented-mode-row">
                  <button className={preferences.interfaceMode === 'beginner' ? 'active' : ''} onClick={() => updatePreference('interfaceMode', 'beginner')}>Beginner Mode</button>
                  <button className={preferences.interfaceMode === 'advanced' ? 'active' : ''} onClick={() => updatePreference('interfaceMode', 'advanced')}>Advanced Mode</button>
                </div>
              </section>
              <section className="panel">
                <div className="panel-title"><LayoutTemplate size={16} /> Sample projects</div>
                <p className="muted-note">Learn by creating something safe and disposable first.</p>
                <div className="vertical-actions">
                  <button className="secondary-button" onClick={() => { setSelectedTemplateId('web_project'); completeOnboarding('templates'); }}>Create Sample Website</button>
                  <button className="secondary-button" onClick={() => { setSelectedTemplateId('react_vite_site'); completeOnboarding('templates'); }}>Create React/Vite Website</button>
                  <button className="secondary-button" onClick={() => { setSelectedTemplateId('tauri_react'); completeOnboarding('templates'); }}>Create Tauri Desktop App</button>
                </div>
              </section>
            </div>
          </section>
        )}

        {activePage === 'editor' && (
          <section className={`page-content editor-page-content ${openFiles.length === 0 ? 'no-open-tabs' : ''}`}>
            <nav className={`tabs ${openFiles.length === 0 ? 'tabs-empty' : ''}`} aria-label="Open editor tabs">
              {openFiles.map((file) => (
                <button
                  key={file.path}
                  className={`tab ${file.path === activePath ? 'active' : ''} ${file.dirty ? 'dirty' : ''}`}
                  onClick={() => setActivePath(file.path)}
                  title={file.path}
                >
                  <FileCode2 size={14} />
                  <span className="dirty-dot" title={file.dirty ? 'Unsaved changes' : 'Saved'} />
                  {file.name}{file.dirty ? ' *' : ''}
                  <span className="tab-close" onClick={(event) => { event.stopPropagation(); closeFile(file.path); }}>Ãƒâ€”</span>
                </button>
              ))}
            </nav>

            <section className="editor-wrap">
              <div className={`editor-ai-layout dock-closed ${activeFile ? 'has-active-file' : 'no-active-file'}`}>
                <div className="editor-canvas">
                  {activeFile ? (
                    <Editor
                      height="100%"
                      language={activeFile.language}
                      value={activeFile.content}
                      theme={preferences.theme === 'light' ? 'vs' : 'vs-dark'}
                      onChange={updateActiveContent}
                      beforeMount={handleEditorBeforeMount}
                      onMount={handleEditorMount}
                      options={{
                        minimap: { enabled: true },
                        lineNumbers: 'on',
                        glyphMargin: true,
                        renderLineHighlight: 'all',
                        fontSize: preferences.editorFontSize,
                        fontFamily: 'Cascadia Code, Consolas, monospace',
                        wordWrap: preferences.wordWrap ? 'on' : 'off',
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                      }}
                    />
                  ) : (
                    <div className="welcome-card editor-welcome-card">
                      <ShieldCheck size={48} />
                      <h2>Open a file to start editing.</h2>
                      <p>Version 0.7.0-dev starts the First Run Setup Wizard track while keeping the streamlined Workspace Menu from v0.7.0-dev.</p>
                      <div className="recent-files-card">
                        <div className="recent-files-header">
                          <strong>Recent Files</strong>
                          {recentFiles.length > 0 && <button className="link-button" onClick={clearRecentFiles}>Clear</button>}
                        </div>
                        {recentFiles.length === 0 ? (
                          <p className="muted-note">No recent files yet. Open a file from the explorer to populate this list.</p>
                        ) : (
                          <div className="recent-files-list">
                            {recentFiles.map((file) => (
                              <button key={file.path} onClick={() => openFileByPath(file.path)} title={file.path}>
                                <FileCode2 size={14} />
                                <span>{file.name}</span>
                                <code>{formatLanguageLabel(file.language)}</code>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </section>

            <div className="editor-footer-strip enhanced-status-strip">
              <span className="status-path" title={activeFile?.path ?? ''}>{activeFile ? activeFile.path : 'No active file'}</span>
              <span>{activeFile ? formatLanguageLabel(activeFile.language) : 'No language'}</span>
              <span>{activeFile ? `${countLines(activeFile.content)} line${countLines(activeFile.content) === 1 ? '' : 's'}` : '0 lines'}</span>
              <span>Ln {activeFile ? cursorPosition.lineNumber : 1}, Col {activeFile ? cursorPosition.column : 1}</span>
              <span className={activeFile?.dirty ? 'dirty-status' : 'clean-status'}>{activeFile?.dirty ? 'Unsaved changes' : 'Saved'}</span>
              <code>{activeFile?.sha256 ? `SHA-256: ${activeFile.sha256}` : 'No active hash'}</code>
            </div>
          </section>
        )}


        {activePage === 'ai' && (
          <section className="page-content utility-page ai-page">
            <section className="panel ai-shell large-panel">
              <div className="ai-header">
                <div>
                  <div className="panel-title"><Bot size={16} /> AI Coding Assistant</div>
                  <p className="muted-note">Optional, privacy-aware project assistant. Configure OpenAI or Ollama in Settings. The app asks before sending project/file context when confirmation is enabled.</p>
                </div>
                <span className={`status-pill ${preferences.aiProvider === 'disabled' ? 'warn-pill' : 'success-pill'}`}>
                  {preferences.aiProvider === 'disabled' ? 'AI Disabled' : `${preferences.aiProvider === 'openai' ? 'OpenAI' : 'Ollama'} Ready`}
                </span>
              </div>

              <div className="ai-grid">
                <section className="ai-controls-card">
                  <label className="setting-row">
                    <span>Context</span>
                    <select value={aiContextMode} onChange={(event) => setAiContextMode(event.target.value as AiContextPreference)}>
                      <option value="selection">Selected code / active file fallback</option>
                      <option value="currentFile">Current file</option>
                      <option value="project">Whole project</option>
                      <option value="problems">Problems / diagnostics output</option>
                      <option value="terminal">Recent terminal output</option>
                      <option value="git">Git status summary</option>
                    </select>
                  </label>
                  <textarea
                    className="ai-prompt-box"
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="Ask the AI to explain, debug, refactor, document, or improve code..."
                  />
                  <div className="ai-code-actions">
                    <div className="mini-section-title">Project-Aware AI Actions</div>
                    <div className="ai-action-grid project-aware-grid">
                      <button type="button" onClick={() => prepareProjectAiAction('ask-project')} disabled={aiBusy}>Ask AI About This Project</button>
                      <button type="button" onClick={() => prepareProjectAiAction('explain-current-file')} disabled={aiBusy || !activeFile}>Explain Current File</button>
                      <button type="button" onClick={() => prepareProjectAiAction('find-bugs')} disabled={aiBusy}>Find Bugs</button>
                      <button type="button" onClick={() => prepareProjectAiAction('improve-code')} disabled={aiBusy}>Improve This Code</button>
                      <button type="button" onClick={() => prepareProjectAiAction('generate-missing-file')} disabled={aiBusy}>Generate Missing File</button>
                      <button type="button" onClick={() => prepareProjectAiAction('create-readme')} disabled={aiBusy}>Create README</button>
                      <button type="button" onClick={() => prepareProjectAiAction('create-installer-script')} disabled={aiBusy}>Create Installer Script</button>
                      <button type="button" onClick={() => prepareProjectAiAction('summarize-project')} disabled={aiBusy}>Summarize Project</button>
                    </div>
                    <div className="mini-section-title subdued-title">Focused Code Actions</div>
                    <div className="ai-action-grid compact-code-action-grid">
                      <button type="button" onClick={() => prepareAiCodeAction('explain-selection')} disabled={aiBusy || !activeFile}>Explain Selection</button>
                      <button type="button" onClick={() => prepareAiCodeAction('fix-problems')} disabled={aiBusy}>Fix Problems</button>
                      <button type="button" onClick={() => prepareAiCodeAction('explain-terminal')} disabled={aiBusy}>Explain Terminal</button>
                      <button type="button" onClick={() => prepareAiCodeAction('commit-message')} disabled={aiBusy}>Commit Message</button>
                      <button type="button" onClick={() => prepareAiCodeAction('add-comments')} disabled={aiBusy || !activeFile}>Generate Comments</button>
                      <button type="button" onClick={() => prepareAiCodeAction('unit-test')} disabled={aiBusy || !activeFile}>Suggest Tests</button>
                    </div>
                  </div>
                  <div className="ai-actions">
                    <button onClick={askAi} disabled={aiBusy || preferences.aiProvider === 'disabled'}><Send size={14} /> {aiBusy ? 'Working...' : 'Ask AI'}</button>
                    <button onClick={() => prepareProjectAiAction('ask-project')} disabled={aiBusy}>Ask Project</button>
                    <button onClick={() => prepareProjectAiAction('summarize-project')} disabled={aiBusy}>Summarize Project</button>
                    <button onClick={() => prepareProjectAiAction('create-installer-script')} disabled={aiBusy}>Installer Script</button>
                  </div>
                  <p className="muted-note">Sensitive files should be excluded with <code>.aiignore</code>. v0.7.0-dev keeps project-wide prompts, web deployment plans, onboarding guidance, hosting help, movable AI Help, open-source acknowledgment guidance, and streamlined workspace navigation while still asking before sending context when enabled.</p>
                </section>

                <section className="ai-response-card">
                  <div className="panel-title"><BrainCircuit size={16} /> Response</div>
                  <pre className="ai-response-output">{aiResponse}</pre>
                  <div className="ai-actions">
                    <button onClick={() => navigator.clipboard.writeText(aiResponse)} disabled={!aiResponse.trim()}><Copy size={14} /> Copy</button>
                    <button onClick={insertAiResponseIntoEditor} disabled={!activeFile || !aiResponse.trim()}><Edit3 size={14} /> Insert into Editor</button>
                    <button onClick={insertAiResponseAsComment} disabled={!activeFile || !aiResponse.trim()}><Edit3 size={14} /> Insert as Comment</button>
                    <button onClick={() => setAiResponse('AI Assistant ready.\n')}><Trash2 size={14} /> Clear</button>
                  </div>
                </section>
              </div>
            </section>
          </section>
        )}

        {activePage === 'findsearch' && (
          <section className="page-content utility-page find-search-page">
            <section className="panel find-search-shell large-panel">
              <div className="find-search-header">
                <div>
                  <div className="panel-title"><Search size={16} /> Find / Search</div>
                  <p className="muted-note">Use one page for current-file Find / Replace or workspace-wide Search Across Files.</p>
                </div>
                <div className="find-search-mode-tabs" role="tablist" aria-label="Find and Search mode">
                  <button
                    type="button"
                    className={findSearchMode === 'current' ? 'active' : ''}
                    onClick={() => setFindSearchMode('current')}
                  >
                    <Edit3 size={13} /> Current File
                  </button>
                  <button
                    type="button"
                    className={findSearchMode === 'workspace' ? 'active' : ''}
                    onClick={() => setFindSearchMode('workspace')}
                  >
                    <Search size={13} /> Workspace
                  </button>
                </div>
              </div>

              {findSearchMode === 'current' ? (
                <div className="find-search-mode-body find-mode-body">
                  <div className="find-form wide-form">
                    <input
                      type="text"
                      value={findQuery}
                      onChange={(event) => setFindQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (activeFile && currentFileFindMatches.length > 0) {
                            selectFindMatch(activeFindIndex);
                          }
                        }
                      }}
                      placeholder="Find in current file..."
                      spellCheck={false}
                    />
                    <input
                      type="text"
                      value={replaceText}
                      onChange={(event) => setReplaceText(event.target.value)}
                      placeholder="Replace with..."
                      spellCheck={false}
                    />
                    <div className="find-options">
                      <label><input type="checkbox" checked={findCaseSensitive} onChange={(event) => setFindCaseSensitive(event.target.checked)} /> Case-sensitive</label>
                      <label><input type="checkbox" checked={findWholeWord} onChange={(event) => setFindWholeWord(event.target.checked)} /> Whole word</label>
                    </div>
                    <div className="find-match-summary">
                      {activeFile
                        ? `${currentFileFindMatches.length === 0 ? 0 : activeFindIndex + 1} of ${currentFileFindMatches.length} match${currentFileFindMatches.length === 1 ? '' : 'es'} in ${activeFile.name}`
                        : 'Type a search now; open a file to run Find / Replace'}
                    </div>
                    <div className="find-actions wide-actions">
                      <button onClick={findPrevious} disabled={!activeFile || currentFileFindMatches.length === 0}>Previous</button>
                      <button onClick={() => selectFindMatch(activeFindIndex)} disabled={!activeFile || currentFileFindMatches.length === 0}>Select</button>
                      <button onClick={findNext} disabled={!activeFile || currentFileFindMatches.length === 0}>Next</button>
                      <button onClick={replaceCurrentMatch} disabled={!activeFile || currentFileFindMatches.length === 0}><Edit3 size={13} /> Replace</button>
                      <button onClick={replaceAllMatches} disabled={!activeFile || currentFileFindMatches.length === 0}><RefreshCw size={13} /> Replace All</button>
                    </div>
                  </div>
                  {currentFileFindMatches.length > 0 && (
                    <div className="find-preview" title={currentFileFindMatches[activeFindIndex]?.preview ?? ''}>
                      Line {currentFileFindMatches[activeFindIndex]?.lineNumber}, Col {currentFileFindMatches[activeFindIndex]?.column}: {currentFileFindMatches[activeFindIndex]?.preview}
                    </div>
                  )}
                </div>
              ) : (
                <div className="find-search-mode-body workspace-search-body">
                  <div className="search-form wide-form">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          runSearch();
                        }
                      }}
                      placeholder="Text to search across workspace..."
                      spellCheck={false}
                    />
                    <input
                      value={searchExtensionFilter}
                      onChange={(event) => setSearchExtensionFilter(event.target.value)}
                      placeholder="Extensions: .ps1,.ts,.cs"
                      spellCheck={false}
                    />
                    <div className="search-options">
                      <label><input type="checkbox" checked={searchCaseSensitive} onChange={(event) => setSearchCaseSensitive(event.target.checked)} /> Case-sensitive</label>
                      <label><input type="checkbox" checked={searchWholeWord} onChange={(event) => setSearchWholeWord(event.target.checked)} /> Whole word</label>
                    </div>
                    <div className="search-actions">
                      <button onClick={runSearch} disabled={searchRunning || !searchQuery.trim()}><Search size={14} /> {searchRunning ? 'Searching' : 'Search'}</button>
                      <button onClick={clearSearch} disabled={searchRunning && searchResults.length === 0}><Trash2 size={14} /> Clear</button>
                    </div>
                  </div>
                  <div className="search-summary">{searchResults.length} result{searchResults.length === 1 ? '' : 's'} shown. Search skips .git, node_modules, target, bin, obj, dist, and build folders.</div>
                  <div className="search-results page-results">
                    {searchResults.length === 0 ? (
                      <p className="muted-note">Run a workspace search to see clickable file results here.</p>
                    ) : (
                      searchResults.map((result, index) => (
                        <button key={`${result.path}-${result.line_number}-${result.column}-${index}`} className="search-result-row" onClick={() => openSearchResult(result)} title={result.path}>
                          <strong>{result.relative_path}</strong>
                          <span>Line {result.line_number}, Col {result.column}</span>
                          <code>{result.preview}</code>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>
          </section>
        )}

        {activePage === 'terminal' && (
          <section className="page-content utility-page terminal-page">
            <section className="panel terminal-panel terminal-panel-page">
              <div className="terminal-header">
                <div>
                  <div className="panel-title"><TerminalSquare size={16} /> Terminal</div>
                  <p title={terminalCwd}>Working directory: {terminalCwd} Ã‚Â· Shell: {shellLabel(preferences.terminalShell)}</p>
                </div>
                <div className="terminal-actions">
                  <button onClick={setTerminalToWorkspace}>Use Workspace</button>
                  <button onClick={setTerminalToSelectedFolder}>Use Selected</button>
                  <button onClick={chooseTerminalFolder}>Choose Folder</button>
                  <button onClick={openExternalTerminal}><ExternalLink size={14} /> Open Terminal</button>
                  <button onClick={copyTerminalOutput}><Copy size={14} /> Copy</button>
                  <button onClick={() => setTerminalOutput('')}><Trash2 size={14} /> Clear</button>
                </div>
              </div>

              <div className="quick-command-row">
                {quickCommands.map((item) => {
                  const reason = commandBlockReason(item.command);
                  return (
                    <button
                      key={item.command}
                      className={item.className ?? ''}
                      onClick={() => runTerminalCommand(item.command)}
                      disabled={terminalRunning || Boolean(reason)}
                      title={reason ?? item.command}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="terminal-input-row">
                <span>PS</span>
                <input
                  value={terminalCommand}
                  onChange={(event) => setTerminalCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      runTerminalCommand();
                    }
                  }}
                  spellCheck={false}
                  placeholder="Type a PowerShell command..."
                />
                <button onClick={() => runTerminalCommand()} disabled={terminalRunning}>
                  <Play size={14} /> {terminalRunning ? 'Running' : 'Run'}
                </button>
              </div>

              <pre ref={terminalOutputRef} className="terminal-output terminal-output-page">{terminalOutput || 'No terminal output yet.'}</pre>
            </section>
          </section>
        )}

        {activePage === 'git' && (
          <section className="page-content utility-page git-page">
            <div className="git-layout">
              <section className="panel git-summary-panel">
                <div className="git-page-header">
                  <div>
                    <div className="panel-title"><GitBranch size={16} /> Git Source Control</div>
                    <p className="muted-note" title={workspacePath}>Workspace: {workspacePath || 'No workspace selected'}</p>
                  </div>
                  <div className="git-actions">
                    <button onClick={() => refreshGitStatus(workspacePath, true)} disabled={gitLoading || !workspacePath.trim()}><RefreshCw size={14} /> {gitLoading ? 'Refreshing' : 'Refresh'}</button>
                    {!gitStatus && <button className="warn-command" onClick={initializeGitRepository} disabled={gitLoading || !workspacePath.trim()}><GitBranch size={14} /> Init Git</button>}
                  </div>
                </div>

                {gitError && !gitStatus && (
                  <div className="git-empty-box">
                    <strong className="warn-text">Git status unavailable</strong>
                    <p>{gitError}</p>
                    <p className="muted-note">Choose a folder that contains a <code>.git</code> folder, or click <strong>Init Git</strong> to create one in the current workspace.</p>
                  </div>
                )}

                {gitStatus ? (
                  <div className="git-status-cards">
                    <div className="git-status-card"><span>Repository Root</span><strong title={gitStatus.git_root}>{gitStatus.git_root}</strong></div>
                    <div className="git-status-card"><span>Branch</span><strong>{gitStatus.branch}{gitStatus.ahead_behind ? ` Ã‚Â· ${gitStatus.ahead_behind}` : ''}</strong></div>
                    <div className="git-status-card"><span>Working Tree</span><strong className={gitStatus.clean ? 'ok-text' : 'warn-text'}>{gitStatus.clean ? 'Clean' : `${gitStatus.changed_files.length} changed file(s)`}</strong></div>
                  </div>
                ) : !gitError ? (
                  <div className="git-empty-box">
                    <strong>Ready for Git status.</strong>
                    <p className="muted-note">Click Refresh to load repository information for the current workspace.</p>
                  </div>
                ) : null}
              </section>

              <section className="panel git-changes-panel">
                <div className="git-page-header">
                  <div className="panel-title"><FileCode2 size={16} /> Changed Files</div>
                  <div className="git-actions">
                    <button onClick={stageAllGitChanges} disabled={gitLoading || !gitStatus || gitStatus.changed_files.length === 0}>Stage All</button>
                  </div>
                </div>
                <div className="git-change-list">
                  {!gitStatus ? (
                    <p className="muted-note">Refresh Git status to show changed files.</p>
                  ) : gitStatus.changed_files.length === 0 ? (
                    <div className="git-empty-box"><strong className="ok-text">No changes detected.</strong><p className="muted-note">The working tree is clean.</p></div>
                  ) : (
                    gitStatus.changed_files.map((file) => (
                      <div key={`${file.status}-${file.path}`} className="git-change-row">
                        <button className="git-change-path" onClick={() => openGitFile(file)} title={gitFilePath(file)}>
                          <code>{file.status || '??'}</code>
                          <span>{file.path}</span>
                        </button>
                        <div className="git-change-actions">
                          <button onClick={() => stageGitFile(file)} disabled={gitLoading}>Stage</button>
                          <button onClick={() => unstageGitFile(file)} disabled={gitLoading || !file.staged}>Unstage</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel git-commit-panel">
                <div className="panel-title"><SaveAll size={16} /> Commit</div>
                <textarea
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder="Commit message..."
                  spellCheck={true}
                />
                <button onClick={commitGitChanges} disabled={gitLoading || !gitStatus || !commitMessage.trim()}><GitBranch size={14} /> Commit Staged Changes</button>
                <p className="muted-note">Stage files first, then commit. Git may ask you to configure user.name and user.email if this is your first commit.</p>
              </section>

              <section className="panel git-commit-panel">
                <div className="panel-title"><GitBranch size={16} /> Recent Commits</div>
                <div className="git-commit-list">
                  {!gitStatus ? (
                    <p className="muted-note">Refresh Git status to show recent commits.</p>
                  ) : gitStatus.recent_commits.length === 0 ? (
                    <p className="muted-note">No commits found yet.</p>
                  ) : (
                    gitStatus.recent_commits.map((commit) => (
                      <div key={commit.hash} className="git-commit-row">
                        <code>{commit.hash}</code>
                        <div>
                          <strong>{commit.message}</strong>
                          <span>{commit.date} Ã‚Â· {commit.author}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel git-commit-panel">
                <div className="panel-title"><Hash size={16} /> Tags</div>
                <div className="tag-create-row">
                  <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="v0.1.9-working-baseline" spellCheck={false} />
                  <button onClick={createGitTag} disabled={gitLoading || !gitStatus || !tagName.trim()}>Create Tag</button>
                </div>
                <div className="tag-list">
                  {!gitStatus ? (
                    <p className="muted-note">Refresh Git status to show tags.</p>
                  ) : gitStatus.tags.length === 0 ? (
                    <p className="muted-note">No tags found yet.</p>
                  ) : (
                    gitStatus.tags.map((tag) => <code key={tag}>{tag}</code>)
                  )}
                </div>
              </section>
            </div>
          </section>
        )}

        {activePage === 'problems' && (
          <section className="page-content utility-page problems-page">
            <div className="problems-layout">
              <section className="panel problems-summary-panel">
                <div className="git-page-header">
                  <div>
                    <div className="panel-title"><AlertTriangle size={16} /> Problems / Diagnostics</div>
                    <p className="muted-note">Run project diagnostics and review TypeScript/Vite and Rust/Cargo errors in one place.</p>
                  </div>
                  <div className="git-actions">
                    <button onClick={runDiagnostics} disabled={diagnosticsBusy || !workspacePath.trim()}><Play size={14} /> {diagnosticsBusy ? 'Running' : 'Run Diagnostics'}</button>
                    <button onClick={clearDiagnostics} disabled={diagnosticsBusy}><Trash2 size={14} /> Clear</button>
                  </div>
                </div>

                <div className="release-status-grid">
                  <div className="git-status-card"><span>Workspace</span><strong title={workspacePath}>{workspacePath || 'Not selected'}</strong></div>
                  <div className="git-status-card"><span>Problems</span><strong className={(diagnostics?.problem_count ?? 0) > 0 ? 'warn-text' : 'ok-text'}>{diagnostics?.problem_count ?? 0}</strong></div>
                  <div className="git-status-card"><span>Errors</span><strong className={(diagnostics?.error_count ?? 0) > 0 ? 'warn-text' : 'ok-text'}>{diagnostics?.error_count ?? 0}</strong></div>
                  <div className="git-status-card"><span>Warnings</span><strong>{diagnostics?.warning_count ?? 0}</strong></div>
                </div>

                {diagnostics?.messages && diagnostics.messages.length > 0 && (
                  <div className="release-warning-box">
                    {diagnostics.messages.map((message) => <p key={message}><AlertTriangle size={14} /> {message}</p>)}
                  </div>
                )}

                <div className="release-paths">
                  <p><strong>Commands:</strong></p>
                  {diagnostics?.commands_run && diagnostics.commands_run.length > 0 ? (
                    diagnostics.commands_run.map((command) => <p key={command}><code>{command}</code></p>)
                  ) : (
                    <p className="muted-note">No diagnostics have been run yet. This page will run the platform npm build command when package.json exists and <code>cargo check</code> when Cargo.toml exists.</p>
                  )}
                </div>
              </section>

              <section className="panel problems-list-panel">
                <div className="panel-title"><FileCode2 size={16} /> Detected Problems</div>
                <div className="diagnostic-list">
                  {!diagnostics ? (
                    <p className="muted-note">Run diagnostics to populate this list.</p>
                  ) : diagnostics.problems.length === 0 ? (
                    <div className="git-empty-box"><strong className="ok-text">No file-level problems detected.</strong><p className="muted-note">If a command failed without file/line output, check the raw output panel.</p></div>
                  ) : (
                    diagnostics.problems.map((problem, index) => (
                      <button
                        key={`${problem.relative_path}-${problem.line_number}-${problem.column}-${index}`}
                        className={`diagnostic-row ${problem.severity}`}
                        onClick={() => openDiagnosticProblem(problem)}
                        title={problem.file_path || problem.message}
                      >
                        <div className="diagnostic-main-line">
                          <strong>{problem.relative_path || 'Command output'}</strong>
                          <span>{problem.line_number > 0 ? `Line ${problem.line_number}, Col ${problem.column}` : problem.source}</span>
                        </div>
                        <div className="diagnostic-meta-line">
                          <code>{problem.severity.toUpperCase()}</code>
                          <span>{problem.source}</span>
                          <span>{problem.command}</span>
                        </div>
                        <p>{problem.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="panel problems-output-panel">
                <div className="git-page-header">
                  <div className="panel-title"><TerminalSquare size={16} /> Raw Diagnostic Output</div>
                  <div className="git-actions">
                    <button onClick={() => navigator.clipboard.writeText(diagnosticsOutput)}><Copy size={14} /> Copy</button>
                  </div>
                </div>
                <pre ref={diagnosticsOutputRef} className="terminal-output release-output">{diagnosticsOutput || 'No diagnostic output yet.'}</pre>
              </section>
            </div>
          </section>
        )}

        {activePage === 'release' && (
          <section className="page-content utility-page release-page">
            <div className="release-layout">
              <section className="panel release-summary-panel">
                <div className="git-page-header">
                  <div>
                    <div className="panel-title"><PackageCheck size={16} /> Release Builder</div>
                    <p className="muted-note">Build, collect installer artifacts, generate SHA-256 checksums, write release notes, and create a ZIP package.</p>
                  </div>
                  <div className="git-actions">
                    <button onClick={refreshReleaseInfo} disabled={releaseBusy || !workspacePath.trim()}><RefreshCw size={14} /> Refresh</button>
                    <button onClick={() => openReleaseFolder(releaseInfo?.release_root)} disabled={!releaseInfo}><ExternalLink size={14} /> Open Releases</button>
                  </div>
                </div>

                {releaseInfo ? (
                  <div className="release-status-grid">
                    <div className="git-status-card"><span>Version</span><strong>{releaseInfo.app_version}</strong></div>
                    <div className="git-status-card"><span>package.json</span><strong className={releaseInfo.has_package_json ? 'ok-text' : 'warn-text'}>{releaseInfo.has_package_json ? 'Found' : 'Missing'}</strong></div>
                    <div className="git-status-card"><span>Tauri Config</span><strong className={releaseInfo.has_tauri_config ? 'ok-text' : 'warn-text'}>{releaseInfo.has_tauri_config ? 'Found' : 'Missing'}</strong></div>
                    <div className="git-status-card"><span>Bundle Artifacts</span><strong className={releaseInfo.has_bundle_artifacts ? 'ok-text' : 'warn-text'}>{releaseInfo.artifact_count}</strong></div>
                  </div>
                ) : (
                  <div className="git-empty-box"><strong>No release information loaded.</strong><p className="muted-note">Choose a project folder and click Refresh.</p></div>
                )}

                {releaseInfo?.warnings && releaseInfo.warnings.length > 0 && (
                  <div className="release-warning-box">
                    {releaseInfo.warnings.map((warning) => <p key={warning}><AlertTriangle size={14} /> {warning}</p>)}
                  </div>
                )}

                <div className="release-paths">
                  <p><strong>Workspace:</strong> <code>{workspacePath}</code></p>
                  <p><strong>Bundle folder:</strong> <code>{releaseInfo?.bundle_directory || 'Not checked yet'}</code></p>
                  <p><strong>Release folder:</strong> <code>{releaseInfo?.release_root || 'Not checked yet'}</code></p>
                </div>
              </section>

              <section className="panel release-actions-panel">
                <div className="panel-title"><Play size={16} /> Build Steps</div>
                <div className="release-step-grid">
                  <button onClick={() => runReleaseCommand('npm Build', `${npmCommand} run build`)} disabled={releaseBusy || !releaseInfo?.has_package_json}><Play size={14} /> 1. npm Build</button>
                  <button onClick={() => runReleaseCommand('Tauri Build', `${npmCommand} run tauri:build`)} disabled={releaseBusy || !releaseInfo?.has_package_json || !releaseInfo?.has_tauri_config}><PackageCheck size={14} /> 2. Tauri Build</button>
                  <button onClick={createReleasePackageFromArtifacts} disabled={releaseBusy || !releaseInfo}><Hash size={14} /> 3. Create Package</button>
                </div>
                <p className="muted-note">Tip: If Tauri Build fails because the dev app is running, use the generated release script or run the Tauri build command from an external terminal after closing the dev app.</p>
                <p className="muted-note">Cross-platform packages are produced by the GitHub Actions workflow included in <code>.github/workflows/build-cross-platform.yml</code>. Windows runners create Windows bundles, macOS runners create macOS bundles, and Linux runners create Linux bundles.</p>
              </section>

              <section className="panel release-notes-panel">
                <div className="panel-title"><Edit3 size={16} /> Release Notes</div>
                <textarea
                  value={releaseNotes}
                  onChange={(event) => setReleaseNotes(event.target.value)}
                  placeholder="# Diligent Code Studio v0.3.6\n\n## Changes\n- Added platform detection for Windows, Linux, and macOS.\n- Added OS-aware terminal shell handling.\n- Added cross-platform npm and folder-opening support."
                  spellCheck={true}
                />
              </section>

              <section className="panel release-output-panel">
                <div className="git-page-header">
                  <div className="panel-title"><TerminalSquare size={16} /> Release Output</div>
                  <div className="git-actions">
                    <button onClick={() => setReleaseOutput('Release Builder output cleared.\n')}><Trash2 size={14} /> Clear</button>
                    <button onClick={() => navigator.clipboard.writeText(releaseOutput)}><Copy size={14} /> Copy</button>
                  </div>
                </div>
                <pre ref={releaseOutputRef} className="terminal-output release-output">{releaseOutput}</pre>
              </section>

              {releaseResult && (
                <section className="panel release-result-panel">
                  <div className="panel-title"><CheckCircle2 size={16} /> Last Release Package</div>
                  <p><strong>Folder:</strong> <code>{releaseResult.release_directory}</code></p>
                  <p><strong>ZIP:</strong> <code>{releaseResult.zip_path}</code></p>
                  <p><strong>Checksums:</strong> <code>{releaseResult.checksum_file}</code></p>
                  <p><strong>Notes:</strong> <code>{releaseResult.notes_file}</code></p>
                  <div className="settings-actions">
                    <button onClick={() => openReleaseFolder(releaseResult.release_directory)}><ExternalLink size={14} /> Open Package Folder</button>
                  </div>
                </section>
              )}
            </div>
          </section>
        )}

        {activePage === 'templates' && (
          <section className="page-content utility-page templates-page">
            <div className="templates-layout">
              <section className="panel templates-panel template-picker-panel">
                <div className="git-page-header">
                  <div>
                    <div className="panel-title"><LayoutTemplate size={16} /> New Project Wizard</div>
                    <p className="muted-note">Create a new starter project with sensible folders, README files, scripts, and Diligent release-ready structure.</p>
                  </div>
                  <button className="secondary-button" onClick={refreshTemplates}><RefreshCw size={14} /> Refresh Templates</button>
                </div>

                <div className="template-form">
                  <label className="setting-row setting-row-wide">
                    <span>Parent folder</span>
                    <input value={templateParentPath} onChange={(event) => setTemplateParentPath(event.target.value)} spellCheck={false} />
                  </label>
                  <div className="template-actions-row">
                    <button onClick={chooseTemplateParentFolder}><FolderOpen size={14} /> Choose Parent</button>
                    {workspacePath.trim() && <button className="secondary-button" onClick={() => setTemplateParentPath(workspacePath)}><Folder size={14} /> Use Workspace</button>}
                  </div>
                  <label className="setting-row setting-row-wide">
                    <span>Project name</span>
                    <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} spellCheck={false} />
                  </label>
                  <label className="setting-row setting-row-wide">
                    <span>Template</span>
                    <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                      {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                  <button className="primary-button full-width" onClick={createProjectFromTemplate} disabled={templateBusy || templates.length === 0}>
                    <Rocket size={15} /> {templateBusy ? 'Creating Project...' : 'Create Project'}
                  </button>
                </div>
              </section>

              <section className="panel templates-panel template-list-panel">
                <div className="panel-title"><FilePlus2 size={16} /> Available Templates</div>
                {templates.length === 0 ? (
                  <p className="muted-note">No templates loaded yet. Click Refresh Templates.</p>
                ) : (
                  <div className="template-card-grid">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        className={`template-card ${selectedTemplateId === template.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <strong>{template.name}</strong>
                        <span>{template.description}</span>
                        <code>{template.files.length} starter item{template.files.length === 1 ? '' : 's'}</code>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="panel templates-panel template-detail-panel">
                <div className="panel-title"><FileCode2 size={16} /> Template Contents</div>
                {templates.find((template) => template.id === selectedTemplateId) ? (
                  <>
                    <h3>{templates.find((template) => template.id === selectedTemplateId)?.name}</h3>
                    <p className="muted-note">{templates.find((template) => template.id === selectedTemplateId)?.description}</p>
                    <div className="template-file-list">
                      {templates.find((template) => template.id === selectedTemplateId)?.files.map((file) => (
                        <code key={file}>{file}</code>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted-note">Select a template to preview its starter files.</p>
                )}
              </section>

              <section className="panel templates-panel template-result-panel">
                <div className="panel-title"><CheckCircle2 size={16} /> Last Created Project</div>
                {!templateResult ? (
                  <p className="muted-note">No project has been created in this session yet.</p>
                ) : (
                  <>
                    <p><strong>{templateResult.template_name}</strong></p>
                    <code className="block-code">{templateResult.project_path}</code>
                    <div className="template-file-list compact-list">
                      {templateResult.created_files.map((file) => <code key={file}>{file}</code>)}
                    </div>
                    <div className="template-actions-row">
                      <button onClick={() => openWorkspace(templateResult.project_path)}><FolderOpen size={14} /> Open Project</button>
                      <button className="secondary-button" onClick={() => runTerminalCommand(`explorer.exe "${templateResult.project_path}"`)}><ExternalLink size={14} /> Open Folder</button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </section>
        )}


        {activePage === 'registry' && (
          <section className="page-content utility-page registry-page">
            <div className="registry-layout">
              <section className="panel registry-summary-panel">
                <div className="panel-title"><Wrench size={16} /> Tool Registry Overview</div>
                <p className="muted-note">Manage built-in and custom command shortcuts without cluttering the main editor interface.</p>
                <div className="registry-stat-grid">
                  <span><strong>{registryStats.total}</strong> total</span>
                  <span><strong>{registryStats.enabled}</strong> enabled</span>
                  <span><strong>{registryStats.builtIn}</strong> built-in</span>
                  <span><strong>{registryStats.custom}</strong> custom</span>
                </div>
                <label className="setting-row registry-filter-row">
                  <span>Category</span>
                  <select value={registryCategoryFilter} onChange={(event) => setRegistryCategoryFilter(event.target.value)}>
                    {registryCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <div className="registry-actions-row">
                  <button className="secondary-button" onClick={() => setRegistryDraft(newCustomRegistryDraft())}><RefreshCw size={14} /> Clear Form</button>
                  <button className="danger-button" onClick={resetToolRegistry}><Trash2 size={14} /> Reset Tool Registry</button>
                </div>
              </section>

              <section className="panel registry-form-panel">
                <div className="panel-title"><FilePlus2 size={16} /> Add Custom Tool</div>
                <div className="registry-form">
                  <label>
                    <span>Name</span>
                    <input value={registryDraft.name} onChange={(event) => updateRegistryDraft('name', event.target.value)} placeholder="Example: Build Installer" />
                  </label>
                  <label>
                    <span>Category</span>
                    <input value={registryDraft.category} onChange={(event) => updateRegistryDraft('category', event.target.value)} placeholder="Custom" />
                  </label>
                  <label className="wide-field">
                    <span>Command</span>
                    <input value={registryDraft.command} onChange={(event) => updateRegistryDraft('command', event.target.value)} placeholder="PowerShell -ExecutionPolicy Bypass -File .\\scripts\\Build.ps1" spellCheck={false} />
                  </label>
                  <label className="wide-field">
                    <span>Description</span>
                    <textarea value={registryDraft.description} onChange={(event) => updateRegistryDraft('description', event.target.value)} placeholder="What this tool does and when to use it." />
                  </label>
                  <button onClick={addCustomRegistryTool}><FilePlus2 size={14} /> Add to Tool Registry</button>
                </div>
              </section>

              <section className="panel registry-list-panel">
                <div className="panel-title"><Wrench size={16} /> Registered Tools</div>
                {filteredRegistryItems.length === 0 ? (
                  <p className="muted-note">No enabled registry tools match this category.</p>
                ) : (
                  <div className="registry-card-grid">
                    {filteredRegistryItems.map((item) => (
                      <article key={item.id} className={`registry-card ${item.builtIn ? 'built-in' : 'custom-tool'}`}>
                        <div className="registry-card-header">
                          <div>
                            <strong>{item.name}</strong>
                            <span>{item.category} Ã¢â‚¬Â¢ {item.builtIn ? 'Built-in' : 'Custom'}</span>
                          </div>
                          <button className="secondary-button" onClick={() => toggleRegistryTool(item.id)} title="Enable or disable this registry tool">
                            {item.enabled ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                          </button>
                        </div>
                        <p>{item.description || 'No description provided.'}</p>
                        <code>{item.command}</code>
                        <div className="registry-card-actions">
                          <button onClick={() => runRegistryTool(item)}><Play size={14} /> Run</button>
                          <button className="secondary-button" onClick={() => copyRegistryCommand(item)}><Copy size={14} /> Copy</button>
                          {!item.builtIn && <button className="danger-button" onClick={() => removeRegistryTool(item.id)}><Trash2 size={14} /> Remove</button>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}


        {activePage === 'web' && (
          <section className="page-content utility-page web-builder-page">
            <div className="web-builder-grid">
              <section className="panel web-builder-hero">
                <div className="git-page-header">
                  <div>
                    <div className="panel-title"><Globe2 size={16} /> Web Builder</div>
                    <p className="muted-note">Build, preview, host locally, test on your LAN, and prepare global deployments for static and React/Vite websites.</p>
                  </div>
                  <button className="secondary-button" onClick={() => setActivePage('setup')}><PackageCheck size={14} /> Setup Web Tools</button>
                </div>
                <div className="web-builder-flow">
                  <span>1. Create or open a web project</span>
                  <ChevronRight size={14} />
                  <span>2. Install components</span>
                  <ChevronRight size={14} />
                  <span>3. Host locally</span>
                  <ChevronRight size={14} />
                  <span>4. Build and deploy globally</span>
                </div>
                <p className="muted-note">Local hosting uses your workspace folder. Global deployment commands require the matching provider account and CLI login.</p>
              </section>

              <section className="panel web-hosting-panel">
                <div className="panel-title"><Play size={16} /> Local and Global Hosting</div>
                <div className="web-card-grid">
                  {webBuilderActions.map((item) => (
                    <article key={item.title} className="web-action-card">
                      <div className="web-card-top">
                        <strong>{item.title}</strong>
                        <span>{item.mode}</span>
                      </div>
                      <p>{item.description}</p>
                      <code>{item.command}</code>
                      <div className="web-action-buttons">
                        <button className="secondary-button" onClick={() => prepareWebBuilderCommand(item.command)}><TerminalSquare size={14} /> Prepare</button>
                        <button onClick={() => runWebBuilderCommand(item.title, item.command)}><Play size={14} /> Run</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel web-components-panel">
                <div className="panel-title"><PackageCheck size={16} /> Installable Web Components and Tools</div>
                <p className="muted-note">Use these buttons to add common web-building packages to the active project. Review package choices before saving or publishing.</p>
                <div className="web-component-grid">
                  {webComponentActions.map((item) => (
                    <article key={item.name} className="web-component-card">
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                      <code>{item.command}</code>
                      <div className="web-action-buttons">
                        <button className="secondary-button" onClick={() => prepareWebBuilderCommand(item.command)}><TerminalSquare size={14} /> Prepare</button>
                        <button onClick={() => runWebBuilderCommand(`Install ${item.name}`, item.command)}><PackageCheck size={14} /> Install</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel web-stack-panel">
                <div className="panel-title"><LayoutTemplate size={16} /> Recommended Web Stack</div>
                <ul className="web-stack-list">
                  <li><strong>Static site:</strong> HTML, CSS, JavaScript, Vite preview, GitHub Pages/Netlify/Vercel.</li>
                  <li><strong>React site:</strong> React + Vite + TypeScript, React Router, Tailwind CSS or Bootstrap.</li>
                  <li><strong>Business site:</strong> reusable components, responsive layout, SEO metadata, contact/download pages.</li>
                  <li><strong>Deployment:</strong> build with <code>npm run build</code>, preview with <code>npm run preview</code>, deploy with Vercel/Netlify/GitHub Pages.</li>
                </ul>
                <div className="web-action-buttons vertical-actions">
                  <button className="secondary-button" onClick={() => { setActivePage('templates'); setSelectedTemplateId('web_project'); }}><LayoutTemplate size={14} /> New Static Website</button>
                  <button className="secondary-button" onClick={() => { setActivePage('templates'); setSelectedTemplateId('react_vite_site'); }}><LayoutTemplate size={14} /> New React/Vite Website</button>
                  <button className="secondary-button" onClick={() => prepareProjectAiAction('create-readme')}><Bot size={14} /> AI Website README</button>
                  <button className="secondary-button" onClick={() => { setAiContextMode('project'); setAiPrompt('Create a practical web deployment plan for this project. Include local preview, LAN testing, production build, Vercel, Netlify, GitHub Pages, DNS/custom domain notes, and a final pre-launch checklist.'); setActivePage('ai'); }}><Bot size={14} /> AI Deployment Plan</button>
                </div>
              </section>
            </div>
          </section>
        )}

        {activePage === 'setup' && (
          <section className="page-content utility-page setup-page">
            <div className="setup-layout">
              <section className="panel setup-summary-panel">
                <div className="git-page-header">
                  <div>
                    <div className="panel-title"><PackageCheck size={16} /> Setup & Dependencies</div>
                    <p className="muted-note">Check and install the developer tools Diligent Code Studio uses for editing, building, packaging, Git, releases, and optional local AI.</p>
                  </div>
                  <button className="secondary-button" onClick={refreshSetupDependencies} disabled={setupLoading}>
                    <RefreshCw size={14} /> {setupLoading ? 'Checking...' : 'Check Again'}
                  </button>
                </div>
                <div className="setup-stat-grid">
                  <span><strong>{setupStats.total}</strong> dependencies</span>
                  <span><strong>{setupStats.installed}</strong> installed</span>
                  <span className={setupStats.missingRequired === 0 ? 'ok' : 'missing'}><strong>{setupStats.missingRequired}</strong> required missing</span>
                  <span><strong>{setupStats.optionalMissing}</strong> optional missing</span>
                </div>
                <p className="muted-note">Install buttons run platform-specific commands, such as <code>winget install</code> on Windows. The app asks for confirmation first and logs the output below.</p>
              </section>

              <section className="panel setup-log-panel">
                <div className="panel-title"><TerminalSquare size={16} /> Setup Install Log</div>
                <div className="setup-log-actions">
                  <button className="secondary-button" onClick={() => setSetupOutput('Setup & Dependencies ready.\n')}><Trash2 size={14} /> Clear</button>
                  <button className="secondary-button" onClick={() => navigator.clipboard.writeText(setupOutput)}><Copy size={14} /> Copy Log</button>
                </div>
                <pre className="terminal-output setup-output">{setupOutput}</pre>
              </section>

              <section className="panel setup-list-panel">
                <div className="panel-title"><Wrench size={16} /> Dependencies</div>
                {setupDependencies.length === 0 ? (
                  <p className="muted-note">No dependency data loaded yet. Click Check Again.</p>
                ) : (
                  <div className="setup-category-stack">
                    {setupCategories.map(([category, items]) => (
                      <div key={category} className="setup-category">
                        <h3>{category}</h3>
                        <div className="setup-card-grid">
                          {items.map((item) => (
                            <article key={item.id} className={`setup-card ${item.available ? 'installed' : item.required ? 'required-missing' : 'optional-missing'}`}>
                              <div className="setup-card-header">
                                <div>
                                  <strong>{item.name}</strong>
                                  <span>{item.required ? 'Required' : 'Optional'} Ã¢â‚¬Â¢ {item.command || 'No command check'}</span>
                                </div>
                                <span className={`setup-status-pill ${item.available ? 'ok' : 'missing'}`}>
                                  {item.available ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                                  {item.available ? 'Installed' : 'Missing'}
                                </span>
                              </div>
                              <p>{item.description}</p>
                              <code>{item.available ? item.version : item.install_command || item.website || item.caution}</code>
                              {item.caution && <p className="setup-caution">{item.caution}</p>}
                              <div className="setup-card-actions">
                                <button className="secondary-button" onClick={() => openSetupDependencyWebsite(item)} disabled={!item.website}>
                                  <ExternalLink size={14} /> Website
                                </button>
                                <button onClick={() => installSetupDependency(item)} disabled={!item.install_supported || setupInstallBusyId === item.id}>
                                  <Play size={14} /> {setupInstallBusyId === item.id ? 'Installing...' : 'Install'}
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}


        {activePage === 'project' && (
          <section className="page-content utility-page project-page">
            <div className="project-grid">
              <section className="panel status-panel project-panel">
                <div className="panel-title"><PackageCheck size={16} /> Project Detection</div>
                {projectInfo ? (
                  <>
                    <div className="detected-types">
                      {projectInfo.project_types.map((type) => <span key={type}>{type}</span>)}
                    </div>
                    <div className="project-flags">
                      <span className={projectInfo.has_git_repository ? 'ok' : 'missing'}><GitBranch size={13} /> Git</span>
                      <span className={projectInfo.has_package_json ? 'ok' : 'missing'}>package.json</span>
                      <span className={projectInfo.has_cargo_toml ? 'ok' : 'missing'}>{projectInfo.has_tauri_project ? 'src-tauri/Cargo.toml' : 'Cargo.toml'}</span>
                      <span className={(projectInfo.has_solution || projectInfo.has_csproj) ? 'ok' : 'missing'}>.NET</span>
                      <span className={projectInfo.has_powershell_scripts ? 'ok' : 'missing'}>PowerShell</span>
                    </div>
                    {projectInfo.warnings.length > 0 && (
                      <div className="project-warnings">
                        {projectInfo.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="muted-note">Choose or refresh a workspace to detect project type.</p>
                )}
              </section>

              <section className="panel platform-panel">
                <div className="panel-title"><Settings2 size={16} /> Platform</div>
                {platformInfo ? (
                  <div className="platform-list">
                    <div><span>OS</span><code>{platformInfo.os} / {platformInfo.arch}</code></div>
                    <div><span>Family</span><code>{platformInfo.family}</code></div>
                    <div><span>Default Shell</span><code>{platformInfo.default_shell}</code></div>
                    <div><span>npm Command</span><code>{platformInfo.npm_command}</code></div>
                    <div><span>Open Folder</span><code>{platformInfo.open_folder_command}</code></div>
                    <p className="muted-note">{platformInfo.release_bundle_note}</p>
                  </div>
                ) : (
                  <p className="muted-note">Platform details have not loaded yet.</p>
                )}
              </section>

              <section className="panel language-support-panel">
                <div className="panel-title"><FileCode2 size={16} /> Language Support</div>
                <p className="muted-note">Compact reference for supported file types and editor language mapping.</p>
                <div className="language-group-list">
                  {languageGroups.map((group) => (
                    <div key={group.group} className="language-group">
                      <strong>{group.group}</strong>
                      <div className="language-chip-row">
                        {group.languages.map((language) => (
                          <span key={`${group.group}-${language.label}-${language.extensions.join('-')}`} className="language-chip" title={`Extensions: ${language.extensions.map((extension) => `.${extension}`).join(', ')}`}>
                            {language.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel tools-panel">
                <div className="panel-title"><Wrench size={16} /> Tool Check</div>
                <button className="secondary-button full-width" onClick={refreshToolStatus}><RefreshCw size={14} /> Recheck Tools</button>
                <div className="tool-list">
                  {toolStatuses.map((tool) => (
                    <div key={tool.name} className={`tool-row ${tool.available ? 'ok' : 'missing'}`} title={tool.available ? tool.version : tool.hint}>
                      <span>{tool.available ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {tool.name}</span>
                      <code>{tool.available ? tool.version : 'Missing'}</code>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel status-panel">
                <div className="panel-title"><CheckCircle2 size={16} /> Security Status</div>
                <ul>
                  <li>Local-first editor shell</li>
                  <li>Rust-backed file operations</li>
                  <li>No telemetry in starter</li>
                  <li>Native folder picker</li>
                  <li>Project detection</li>
                  <li>Terminal preflight checks</li>
                  <li>Search Across Files</li>
                  <li>Find / Replace Current File</li>
                  <li>Persistent settings</li>
                  <li>Dedicated Git page</li>
                  <li>Release Builder</li>
                  <li>Problems / Diagnostics page</li>
                  <li>Language-aware editor polish</li>
                  <li>Project Templates / New Project Wizard</li>
                  <li>SHA-256 built in</li>
                </ul>
              </section>

              <section className="panel hash-panel">
                <div className="panel-title"><Hash size={16} /> Active File Hash</div>
                <code>{activeFile?.sha256 ?? 'No hash calculated yet.'}</code>
              </section>
            </div>
          </section>
        )}


        {activePage === 'credits' && (
          <section className="page-content utility-page credits-page">
            <div className="credits-layout">
              <section className="panel credits-hero-panel">
                <div>
                  <div className="panel-title"><ExternalLink size={16} /> Open Source Credits</div>
                  <h2>Built with gratitude for the open-source community.</h2>
                  <p className="muted-note">Diligent Code Studio depends on open-source frameworks, libraries, tools, and community projects. This page gives users a visible place to recognize those contributors and open each project website in the default browser.</p>
                </div>
                <div className="credits-stat-grid">
                  <span><strong>{OPEN_SOURCE_CREDITS.length}</strong> projects</span>
                  <span><strong>{new Set(OPEN_SOURCE_CREDITS.map((credit) => credit.category)).size}</strong> categories</span>
                </div>
              </section>

              <section className="panel credits-note-panel">
                <div className="panel-title"><ShieldCheck size={16} /> Respecting Licenses</div>
                <p className="muted-note">This credits page is an acknowledgment page, not a replacement for license review. Before public release, review each dependency license and keep NOTICE, LICENSE, third-party notices, and package manifests up to date.</p>
              </section>

              <section className="panel credits-list-panel">
                <div className="panel-title"><Globe2 size={16} /> Project Links</div>
                <div className="credits-card-grid">
                  {OPEN_SOURCE_CREDITS.map((credit) => (
                    <article key={`${credit.category}-${credit.name}`} className="credits-card">
                      <div className="credits-card-header">
                        <div>
                          <strong>{credit.name}</strong>
                          <span>{credit.category}</span>
                        </div>
                        <button className="secondary-button" onClick={() => openOpenSourceCredit(credit)} title={`Open ${credit.name} website`}>
                          <ExternalLink size={14} /> Visit
                        </button>
                      </div>
                      <p>{credit.role}</p>
                      <code>{credit.website}</code>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {activePage === 'settings' && (
          <section className="page-content utility-page settings-page">
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="panel-title"><SlidersHorizontal size={16} /> Appearance</div>
                <label className="setting-row">
                  <span>Theme</span>
                  <select value={preferences.theme} onChange={(event) => updatePreference('theme', event.target.value as ThemePreference)}>
                    <option value="dark">Dark</option>
                    <option value="midnight">Midnight Blue</option>
                    <option value="light">Light</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span>Editor font size</span>
                  <input
                    type="number"
                    min={10}
                    max={28}
                    value={preferences.editorFontSize}
                    onChange={(event) => updatePreference('editorFontSize', clampNumber(event.target.value, 14, 10, 28))}
                  />
                </label>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.wordWrap} onChange={(event) => updatePreference('wordWrap', event.target.checked)} />
                  Enable editor word wrap
                </label>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.compactMode} onChange={(event) => updatePreference('compactMode', event.target.checked)} />
                  Enable compact interface mode
                </label>
              </section>

              <section className="panel settings-panel compact-settings-panel">
                <div className="panel-title"><LayoutTemplate size={16} /> Workspace Menu</div>
                <p className="muted-note compact-note">Drag the top workspace menu buttons directly to rearrange them. Templates starts on the far left by default.</p>
                <div className="settings-actions compact-settings-actions">
                  <button className="small-action-button" onClick={resetMenuPageOrder}><RefreshCw size={13} /> Reset Menu Order</button>
                </div>
              </section>

              <section className="panel settings-panel">
                <div className="panel-title"><SaveAll size={16} /> Save Behavior</div>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.autoSave} onChange={(event) => updatePreference('autoSave', event.target.checked)} />
                  Enable auto-save for dirty files
                </label>
                <label className="setting-row">
                  <span>Auto-save delay</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={preferences.autoSaveDelaySeconds}
                    onChange={(event) => updatePreference('autoSaveDelaySeconds', clampNumber(event.target.value, 3, 1, 30))}
                  />
                </label>
                <p className="muted-note">Auto-save writes the active file after the delay. Manual Save still works normally.</p>
              </section>

              <section className="panel settings-panel wide-settings-panel">
                <div className="panel-title"><FolderOpen size={16} /> Workspace Startup</div>
                <label className="setting-row setting-row-wide">
                  <span>Default workspace</span>
                  <input
                    value={preferences.defaultWorkspacePath}
                    onChange={(event) => updatePreference('defaultWorkspacePath', event.target.value)}
                    spellCheck={false}
                  />
                </label>
                <div className="settings-actions">
                  <button onClick={useCurrentWorkspaceAsDefault}><FolderOpen size={14} /> Use Current Workspace</button>
                  <button onClick={() => openWorkspace(preferences.defaultWorkspacePath)}><RefreshCw size={14} /> Open Default</button>
                </div>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.rememberLastWorkspace} onChange={(event) => updatePreference('rememberLastWorkspace', event.target.checked)} />
                  Remember last opened workspace
                </label>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.openWorkspaceOnStartup} onChange={(event) => updatePreference('openWorkspaceOnStartup', event.target.checked)} />
                  Open remembered/default workspace on startup
                </label>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.rememberExpandedFolders} onChange={(event) => updatePreference('rememberExpandedFolders', event.target.checked)} />
                  Remember collapsed/expanded folders per workspace
                </label>
              </section>


              <section className="panel settings-panel wide-settings-panel">
                <div className="panel-title"><Bot size={16} /> AI Assistant</div>
                <p className="muted-note">AI is optional. OpenAI sends selected context to the OpenAI API. Ollama uses a local endpoint, usually <code>http://127.0.0.1:11434</code>.</p>
                <label className="setting-row">
                  <span>Provider</span>
                  <select value={preferences.aiProvider} onChange={(event) => updatePreference('aiProvider', event.target.value as AiProviderPreference)}>
                    <option value="disabled">Disabled</option>
                    <option value="openai">OpenAI API</option>
                    <option value="ollama">Ollama Local</option>
                  </select>
                </label>
                <label className="setting-row setting-row-wide">
                  <span>OpenAI API key</span>
                  <input
                    type="password"
                    value={preferences.aiOpenAiApiKey}
                    onChange={(event) => updatePreference('aiOpenAiApiKey', event.target.value)}
                    placeholder="sk-..."
                    spellCheck={false}
                  />
                </label>
                <label className="setting-row">
                  <span>OpenAI model</span>
                  <input value={preferences.aiOpenAiModel} onChange={(event) => updatePreference('aiOpenAiModel', event.target.value)} spellCheck={false} />
                </label>
                <label className="setting-row setting-row-wide">
                  <span>Ollama endpoint</span>
                  <input value={preferences.aiOllamaEndpoint} onChange={(event) => updatePreference('aiOllamaEndpoint', event.target.value)} spellCheck={false} />
                </label>
                <div className="setting-row setting-row-wide">
                  <span>Ollama status</span>
                  <div className="ollama-status-box">
                    <strong>{ollamaStatus ? (ollamaStatus.running ? 'Running' : ollamaStatus.installed ? 'Installed, not responding' : 'Not detected') : 'Not checked yet'}</strong>
                    <small>{ollamaStatus?.message ?? 'Click Refresh Models to check whether Ollama is installed, running, and has local models available.'}</small>
                    {ollamaStatus?.version && <code>{ollamaStatus.version}</code>}
                  </div>
                </div>
                <div className="setting-row setting-row-wide ollama-model-row">
                  <span>Ollama model</span>
                  <div className="ollama-model-controls">
                    <select
                      value={preferences.aiOllamaModel}
                      onChange={(event) => updatePreference('aiOllamaModel', event.target.value)}
                      disabled={ollamaModelsLoading}
                    >
                      {ollamaModels.length === 0 ? (
                        <option value={preferences.aiOllamaModel}>{preferences.aiOllamaModel || 'No local models found'}</option>
                      ) : (
                        ollamaModels.map((model) => (
                          <option key={model.name} value={model.name}>{model.name}</option>
                        ))
                      )}
                    </select>
                    <button type="button" onClick={refreshOllamaModels} disabled={ollamaModelsLoading}>
                      <RefreshCw size={14} /> {ollamaModelsLoading ? 'Checking...' : 'Refresh Models'}
                    </button>
                  </div>
                  <input
                    className="manual-model-input"
                    value={preferences.aiOllamaModel}
                    onChange={(event) => updatePreference('aiOllamaModel', event.target.value)}
                    placeholder="Manual model name, e.g. llama3.2 or codellama"
                    spellCheck={false}
                  />
                  {ollamaModelsError && <p className="setting-help warning-help">{ollamaModelsError}</p>}
                  {!ollamaModelsError && ollamaModels.length > 0 && <p className="setting-help">Detected {ollamaModels.length} local Ollama model(s).</p>}
                </div>
                <label className="setting-row">
                  <span>Default AI context</span>
                  <select value={preferences.aiDefaultContext} onChange={(event) => updatePreference('aiDefaultContext', event.target.value as AiContextPreference)}>
                    <option value="selection">Selected code</option>
                    <option value="currentFile">Current file</option>
                    <option value="project">Whole project</option>
                    <option value="problems">Problems output</option>
                    <option value="terminal">Terminal output</option>
                    <option value="git">Git status</option>
                  </select>
                </label>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.aiRequireConfirmation} onChange={(event) => updatePreference('aiRequireConfirmation', event.target.checked)} />
                  Require confirmation before sending code/context to AI
                </label>
                <div className="security-note-box">
                  <ShieldCheck size={16} />
                  <div>
                    <strong>Session-only API key storage</strong>
                    <p className="muted-note">OpenAI API keys are kept only in memory for the current app session and are not saved to local preferences. Ollama remains the recommended local-first option for private code reviews.</p>
                  </div>
                </div>
              </section>

              <section className="panel settings-panel">
                <div className="panel-title"><TerminalSquare size={16} /> Terminal</div>
                <label className="setting-row">
                  <span>Preferred shell</span>
                  <select value={preferences.terminalShell} onChange={(event) => updatePreference('terminalShell', event.target.value as TerminalShellPreference)}>
                    <option value="auto">Auto / OS Default</option>
                    <option value="powershell">Windows PowerShell / pwsh fallback</option>
                    <option value="pwsh">PowerShell 7</option>
                    <option value="cmd">Command Prompt</option>
                    <option value="bash">bash</option>
                    <option value="zsh">zsh</option>
                  </select>
                </label>
                <p className="muted-note">Auto uses the detected OS default: Windows PowerShell on Windows, zsh on macOS, and bash on Linux. PowerShell 7 requires <code>pwsh</code>/<code>pwsh.exe</code> on PATH.</p>
              </section>

              <section className="panel settings-panel">
                <div className="panel-title"><Settings2 size={16} /> Session</div>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.rememberLastActivePage} onChange={(event) => updatePreference('rememberLastActivePage', event.target.checked)} />
                  Remember last active page
                </label>
                <p className="muted-note">Settings are stored locally on this computer. No telemetry or account sync is included. Sensitive secrets such as OpenAI API keys are not persisted by Diligent Code Studio.</p>
                <div className="settings-actions">
                  <button className="danger-button" onClick={resetPreferences}><Trash2 size={14} /> Reset Preferences</button>
                </div>
              </section>
            </div>
          </section>
        )}

        {activePage === 'logs' && (
          <section className="page-content utility-page logs-page">
            <section className="activity-log activity-log-page">
              <div className="log-page-header">
                <div className="panel-title"><AlertTriangle size={16} /> Activity Log</div>
                <button className="secondary-button" onClick={() => setActivity([])}><Trash2 size={14} /> Clear Logs</button>
              </div>
              {activity.length === 0 ? (
                <p className="muted-note">No activity log entries.</p>
              ) : (
                activity.map((item, index) => (
                  <div key={`${item.at}-${index}`} className={`log-row ${item.level}`}>
                    <span>{item.at}</span>
                    <p>{item.message}</p>
                  </div>
                ))
              )}
            </section>
          </section>
        )}

      </section>


      {onboardingOpen && (
        <section className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="First Run Setup Wizard">
          <div className="onboarding-dialog first-run-wizard-dialog">
            <header className="onboarding-header">
              <div>
                <div className="panel-title"><Rocket size={18} /> First Run Setup Wizard</div>
                <h2>Set up Diligent Code Studio</h2>
                <p>Choose your starting preferences, verify required tools, configure optional AI support, and then open the workspace that matches what you want to do next.</p>
              </div>
              <button className="icon-only-button" onClick={() => completeOnboarding()}>Ãƒâ€”</button>
            </header>

            <div className="onboarding-progress-grid">
              <section className="onboarding-step-card">
                <span>Step 1</span>
                <strong>Choose interface mode</strong>
                <p>Beginner keeps more explanations visible. Advanced keeps the same tools with less hand-holding.</p>
                <div className="segmented-mode-row">
                  <button className={preferences.interfaceMode === 'beginner' ? 'active' : ''} onClick={() => updatePreference('interfaceMode', 'beginner')}>Beginner</button>
                  <button className={preferences.interfaceMode === 'advanced' ? 'active' : ''} onClick={() => updatePreference('interfaceMode', 'advanced')}>Advanced</button>
                </div>
              </section>
              <section className="onboarding-step-card">
                <span>Step 2</span>
                <strong>Check dependencies</strong>
                <p>Verify Node.js, Git, Rust, Tauri, GitHub CLI, Ollama, and other optional tools.</p>
                <button className="secondary-button" onClick={() => completeOnboarding('setup')}><PackageCheck size={14} /> Open Setup</button>
              </section>
              <section className="onboarding-step-card">
                <span>Step 3</span>
                <strong>Pick AI mode</strong>
                <p>Ollama is recommended for local-first work. You can keep AI disabled until you are ready.</p>
                <div className="segmented-mode-row wrap-row">
                  <button className={preferences.aiProvider === 'ollama' ? 'active' : ''} onClick={() => updatePreference('aiProvider', 'ollama')}>Ollama</button>
                  <button className={preferences.aiProvider === 'openai' ? 'active' : ''} onClick={() => updatePreference('aiProvider', 'openai')}>OpenAI</button>
                  <button className={preferences.aiProvider === 'disabled' ? 'active' : ''} onClick={() => updatePreference('aiProvider', 'disabled')}>Disabled</button>
                </div>
              </section>
              <section className="onboarding-step-card">
                <span>Step 4</span>
                <strong>Choose a workspace path</strong>
                <p>This becomes the default folder used when opening projects and creating templates.</p>
                <input
                  className="onboarding-path-input"
                  value={preferences.defaultWorkspacePath}
                  onChange={(event) => updatePreference('defaultWorkspacePath', event.target.value)}
                  placeholder="C:\DiligentProjects"
                />
              </section>
            </div>

            <div className="onboarding-choice-grid">
              <button onClick={() => completeOnboarding('templates')}><LayoutTemplate size={20} /><strong>Build a desktop app</strong><span>Start from a project template.</span></button>
              <button onClick={() => completeOnboarding('web')}><Globe2 size={20} /><strong>Build a website</strong><span>Preview locally or prepare public hosting.</span></button>
              <button onClick={() => completeOnboarding('editor')}><FolderOpen size={20} /><strong>Open an existing project</strong><span>Choose a folder and edit files.</span></button>
              <button onClick={() => completeOnboarding('ai')}><Bot size={20} /><strong>Use AI with code</strong><span>Ask project-aware coding questions.</span></button>
              <button onClick={() => completeOnboarding('release')}><Rocket size={20} /><strong>Create an installer</strong><span>Validate, build, and package releases.</span></button>
              <button onClick={() => completeOnboarding('credits')}><ExternalLink size={20} /><strong>View open-source credits</strong><span>Recognize the contributors behind the tools used here.</span></button>
            </div>
            <footer className="onboarding-footer">
              <button className="secondary-button" onClick={() => setHelpManualOpen(true)}>Open Manual</button>
              <button className="secondary-button" onClick={() => completeOnboarding('start')}>Finish and Open Start Here</button>
            </footer>
          </div>
        </section>
      )}

      {helpManualOpen && (
        <section className="help-manual-overlay" role="dialog" aria-modal="true" aria-label="Diligent Code Studio Operator/User Manual">
          <div className="help-manual-dialog">
            <header className="help-manual-header">
              <div>
                <strong>Diligent Code Studio Operator/User Manual</strong>
                <span>PDF help for installation, setup, navigation, AI assistance, Git, diagnostics, troubleshooting, and release packaging.</span>
              </div>
              <div className="help-manual-actions">
                <button className="secondary-button" onClick={() => window.open(USER_MANUAL_PATH, '_blank', 'noopener,noreferrer')}><ExternalLink size={14} /> Open PDF</button>
                <button className="secondary-button" onClick={() => setHelpManualOpen(false)}>Close</button>
              </div>
            </header>
            <iframe
              className="help-manual-frame"
              title="Diligent Code Studio Operator/User Manual PDF"
              src={`${USER_MANUAL_PATH}#view=FitH`}
            />
          </div>
        </section>
      )}


      {aiDockOpen && (
        <aside
          ref={assistantPocketRef}
          className={`assistant-pocket expanded ${aiHelpDragging ? 'dragging' : ''}`}
          aria-label="AI Help"
          style={{ left: `${aiHelpPosition.left}px`, top: `${aiHelpPosition.top}px` }}
        >
          <div
            className="assistant-pocket-header draggable-ai-help-header"
            onPointerDown={beginAiHelpDrag}
            onPointerMove={moveAiHelpDrag}
            onPointerUp={endAiHelpDrag}
            onPointerCancel={endAiHelpDrag}
            title="Drag AI Help to move it"
          >
            <div>
              <div className="panel-title"><Bot size={15} /> AI Help <span className="drag-hint">Drag to move</span></div>
              <p className="muted-note">Quick navigation and screen help. Coding results stay in the AI Coding Assistant window unless you ask from here.</p>
            </div>
            <div className="assistant-pocket-window-actions">
              <button className="icon-only-button" onClick={resetAiHelpPosition} title="Reset AI Help position"><RefreshCw size={13} /></button>
              <button className="icon-only-button" onClick={() => setAiDockOpen(false)} title="Close AI Help">Ãƒâ€”</button>
            </div>
          </div>

          <div className="assistant-pocket-quick-row project-aware-pocket-row">
            <button type="button" onClick={() => prepareAiHelpAction('navigate')} disabled={aiBusy}>Navigate This Screen</button>
            <button type="button" onClick={() => prepareAiHelpAction('project')} disabled={aiBusy}>Project Status</button>
            <button type="button" onClick={() => { setActivePage('ai'); setAiDockOpen(false); }} disabled={aiBusy}>Open AI Window</button>
            <button type="button" onClick={() => prepareAiHelpAction('coding')} disabled={aiBusy}>Where Is Coding Help?</button>
          </div>

          <textarea
            className="editor-ai-prompt assistant-pocket-prompt"
            value={aiHelpPrompt}
            onChange={(event) => setAiHelpPrompt(event.target.value)}
            placeholder="Ask for help navigating this screen or understanding what to do next..."
          />

          <div className="editor-ai-dock-actions assistant-pocket-actions">
            <button onClick={askAiHelp} disabled={aiBusy || preferences.aiProvider === 'disabled'}><Send size={13} /> {aiBusy ? 'Working...' : 'Ask'}</button>
            <button onClick={() => navigator.clipboard.writeText(aiHelpResponse)} disabled={!aiHelpResponse.trim()}><Copy size={13} /> Copy</button>
            <button onClick={() => setAiHelpResponse('AI Help ready. Ask a quick navigation question, or open the AI Coding Assistant window for full coding output.\n')}><Trash2 size={13} /> Clear</button>
            <button onClick={() => setActivePage('settings')}>Settings</button>
          </div>

          <pre className="editor-ai-response-output assistant-pocket-response">{aiHelpResponse}</pre>

          <div className="assistant-pocket-status">
            <span className={preferences.aiProvider === 'disabled' ? 'warn-text' : 'ok-text'}>{preferences.aiProvider === 'disabled' ? 'AI disabled' : `Provider: ${preferences.aiProvider}`}</span>
            <span>Main coding output: AI window</span>
          </div>
        </aside>
      )}

    </main>
  );
}
