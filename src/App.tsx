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
import { useEffect, useMemo, useRef, useState } from 'react';
import { languageFromPath, languageLabelFromId, languageLabelFromPath, registerDiligentLanguages, supportedLanguageGroups } from './editorLanguages';
import type { ActivityItem, DiagnosticProblem, DiagnosticRunResult, GitChangedFile, GitStatusInfo, OpenFile, ProjectInfo, ReleaseInfo, ReleasePackageResult, ProjectTemplate, ProjectTemplateResult, SearchResult, TerminalResult, ToolRegistryItem, ToolStatus, PlatformInfo, WorkspaceEntry, AiChatResponse } from './types';

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

type WorkspacePage = 'templates' | 'editor' | 'ai' | 'findsearch' | 'terminal' | 'git' | 'problems' | 'release' | 'registry' | 'project' | 'logs' | 'settings';

type ThemePreference = 'dark' | 'midnight' | 'light';
type TerminalShellPreference = 'auto' | 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'zsh';
type AiProviderPreference = 'disabled' | 'openai' | 'ollama';
type AiContextPreference = 'selection' | 'currentFile' | 'problems' | 'terminal' | 'git';

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
  menuPageOrder: WorkspacePage[];
};

const PREFERENCES_STORAGE_KEY = 'diligent-code-studio.preferences.v1';

const DEFAULT_PAGE_ORDER: WorkspacePage[] = [
  'templates',
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
    case 'registry': return 'Registry';
    case 'project': return 'Tools';
    case 'logs': return 'Logs';
    case 'settings': return 'Settings';
    default: return String(page);
  }
}

function normalizePageOrder(value: unknown): WorkspacePage[] {
  const requested = Array.isArray(value) ? value : [];
  const ordered: WorkspacePage[] = [];

  for (const item of requested) {
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
  lastActivePage: 'editor',
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
  menuPageOrder: DEFAULT_PAGE_ORDER,
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeWorkspacePage(value: unknown): WorkspacePage {
  const page = String(value);
  if (page === 'find' || page === 'search' || page === 'findsearch') return 'findsearch';
  if (['editor', 'ai', 'terminal', 'git', 'problems', 'release', 'templates', 'registry', 'project', 'logs', 'settings'].includes(page)) return page as WorkspacePage;
  return DEFAULT_PREFERENCES.lastActivePage;
}

function isWorkspacePage(value: unknown): value is WorkspacePage {
  return ['editor', 'ai', 'findsearch', 'terminal', 'git', 'problems', 'release', 'templates', 'registry', 'project', 'logs', 'settings'].includes(String(value));
}

function loadPreferences(): AppPreferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    const theme = ['dark', 'midnight', 'light'].includes(String(parsed.theme)) ? parsed.theme as ThemePreference : DEFAULT_PREFERENCES.theme;
    const terminalShell = ['auto', 'powershell', 'pwsh', 'cmd', 'bash', 'zsh'].includes(String(parsed.terminalShell)) ? parsed.terminalShell as TerminalShellPreference : DEFAULT_PREFERENCES.terminalShell;
    const aiProvider = ['disabled', 'openai', 'ollama'].includes(String(parsed.aiProvider)) ? parsed.aiProvider as AiProviderPreference : DEFAULT_PREFERENCES.aiProvider;
    const aiDefaultContext = ['selection', 'currentFile', 'problems', 'terminal', 'git'].includes(String(parsed.aiDefaultContext)) ? parsed.aiDefaultContext as AiContextPreference : DEFAULT_PREFERENCES.aiDefaultContext;
    const menuPageOrder = normalizePageOrder(parsed.menuPageOrder);

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      theme,
      terminalShell,
      aiProvider,
      aiDefaultContext,
      menuPageOrder,
      editorFontSize: clampNumber(parsed.editorFontSize, DEFAULT_PREFERENCES.editorFontSize, 10, 28),
      autoSaveDelaySeconds: clampNumber(parsed.autoSaveDelaySeconds, DEFAULT_PREFERENCES.autoSaveDelaySeconds, 1, 30),
      lastActivePage: normalizeWorkspacePage(parsed.lastActivePage),
      defaultWorkspacePath: parsed.defaultWorkspacePath?.trim() || DEFAULT_PREFERENCES.defaultWorkspacePath,
      lastWorkspacePath: parsed.lastWorkspacePath?.trim() || parsed.defaultWorkspacePath?.trim() || DEFAULT_PREFERENCES.lastWorkspacePath,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(preferences: AppPreferences) {
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences, null, 2));
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

export default function App() {
  const editorRef = useRef<any>(null);
  const terminalOutputRef = useRef<HTMLPreElement | null>(null);
  const releaseOutputRef = useRef<HTMLPreElement | null>(null);
  const diagnosticsOutputRef = useRef<HTMLPreElement | null>(null);
  const startupLoadedRef = useRef(false);
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
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
    { at: nowStamp(), level: 'info', message: 'Diligent Code Studio v0.4.1 loaded with AI Code Actions.' },
  ]);
  const [terminalCommand, setTerminalCommand] = useState('git status');
  const [terminalOutput, setTerminalOutput] = useState(
    'Diligent Terminal ready. Version 0.4.1 includes AI Code Actions.\n',
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
  const [aiResponse, setAiResponse] = useState('AI Assistant ready. Configure OpenAI or Ollama in Settings, then ask about selected code, the current file, diagnostics, terminal output, or Git status.\n');
  const [aiContextMode, setAiContextMode] = useState<AiContextPreference>(() => loadPreferences().aiDefaultContext);
  const [aiBusy, setAiBusy] = useState(false);


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

  const npmCommand = platformInfo?.npm_command || 'npm';
  const isWindowsPlatform = !platformInfo || platformInfo.os === 'windows';

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
      case 'registry': return 'Extension / Tools Registry';
      case 'project': return 'Project / Tools';
      case 'logs': return 'Activity Logs';
      case 'settings': return 'Settings / Preferences';
      default: return 'Diligent Code Studio';
    }
  }, [activeFile, activePage, findSearchMode]);

  useEffect(() => {
    refreshPlatformInfo();
    refreshToolStatus();
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
  }

  function moveMenuPage(page: WorkspacePage, direction: 'left' | 'right') {
    setPreferences((current) => {
      const order = normalizePageOrder(current.menuPageOrder);
      const index = order.indexOf(page);
      if (index < 0) return current;

      const nextIndex = direction === 'left' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= order.length) return current;

      const next = [...order];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...current, menuPageOrder: next };
    });
  }

  function resetMenuPageOrder() {
    setPreferences((current) => ({ ...current, menuPageOrder: DEFAULT_PAGE_ORDER }));
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
      case 'registry': return <Wrench size={14} />;
      case 'project': return <PackageCheck size={14} />;
      case 'logs': return <AlertTriangle size={14} />;
      case 'settings': return <SlidersHorizontal size={14} />;
      default: return <FileCode2 size={14} />;
    }
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

    log('info', `Prepared AI code action: ${action}. Review the prompt, then click Ask AI.`);
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
    const confirmed = window.confirm('Reset the Tools Registry to the built-in defaults? Custom tools will be removed.');
    if (!confirmed) return;
    setToolRegistryItems(DEFAULT_TOOL_REGISTRY);
    setRegistryCategoryFilter('All');
    setRegistryDraft(newCustomRegistryDraft());
    log('info', 'Tools Registry reset to built-in defaults.');
  }

  async function runRegistryTool(item: ToolRegistryItem) {
    if (!item.enabled) {
      log('warn', `Registry tool is disabled: ${item.name}`);
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

  return (
    <main className={`app-shell theme-${preferences.theme} ${preferences.compactMode ? 'compact-mode' : ''}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon"><ShieldCheck size={24} /></div>
          <div>
            <h1>Diligent Code Studio</h1>
            <p className="brand-tagline">Secure software-building workbench</p>
            <p>Community Edition v0.3.8</p>
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
        <header className="topbar">
          <div className="page-title-block">
            <h2>{activePageTitle}</h2>
          </div>
          <div className="toolbar">
            <nav className="top-page-nav" aria-label="Workspace pages">
              {normalizePageOrder(preferences.menuPageOrder).map((page) => (
                <button
                  key={page}
                  className={activePage === page ? 'active' : ''}
                  onClick={() => activateWorkspacePage(page)}
                  title={`${workspacePageLabel(page)} page`}
                >
                  {workspacePageIcon(page)} {workspacePageLabel(page)}
                </button>
              ))}
            </nav>
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
        </header>

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
                  <span className="tab-close" onClick={(event) => { event.stopPropagation(); closeFile(file.path); }}>×</span>
                </button>
              ))}
            </nav>

            <section className="editor-wrap">
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
                  <p>Version 0.4.1 adds AI Code Actions for practical coding help.</p>
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
                  <p className="muted-note">Optional, privacy-aware coding help. Configure OpenAI or Ollama in Settings. The app asks before sending code when confirmation is enabled.</p>
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
                    <div className="mini-section-title">Code Actions</div>
                    <div className="ai-action-grid">
                      <button type="button" onClick={() => prepareAiCodeAction('explain-selection')} disabled={aiBusy || !activeFile}>Explain Selection</button>
                      <button type="button" onClick={() => prepareAiCodeAction('review-current-file')} disabled={aiBusy || !activeFile}>Review File</button>
                      <button type="button" onClick={() => prepareAiCodeAction('fix-problems')} disabled={aiBusy}>Fix Problems</button>
                      <button type="button" onClick={() => prepareAiCodeAction('explain-terminal')} disabled={aiBusy}>Explain Terminal</button>
                      <button type="button" onClick={() => prepareAiCodeAction('commit-message')} disabled={aiBusy}>Commit Message</button>
                      <button type="button" onClick={() => prepareAiCodeAction('refactor-selection')} disabled={aiBusy || !activeFile}>Refactor Selection</button>
                      <button type="button" onClick={() => prepareAiCodeAction('add-comments')} disabled={aiBusy || !activeFile}>Generate Comments</button>
                      <button type="button" onClick={() => prepareAiCodeAction('unit-test')} disabled={aiBusy || !activeFile}>Suggest Tests</button>
                    </div>
                  </div>
                  <div className="ai-actions">
                    <button onClick={askAi} disabled={aiBusy || preferences.aiProvider === 'disabled'}><Send size={14} /> {aiBusy ? 'Working...' : 'Ask AI'}</button>
                    <button onClick={() => { setAiContextMode('selection'); setAiPrompt('Explain the selected code and identify possible bugs, security concerns, and maintainability improvements.'); }} disabled={aiBusy}>Explain / Review</button>
                    <button onClick={() => { setAiContextMode('problems'); setAiPrompt('Use the Problems output to explain the build error and recommend the exact files or commands to fix it.'); }} disabled={aiBusy}>Explain Problems</button>
                    <button onClick={() => { setAiContextMode('git'); setAiPrompt('Create a concise Git commit message based on the Git status context.'); }} disabled={aiBusy}>Commit Message</button>
                  </div>
                  <p className="muted-note">Sensitive files should be excluded with <code>.aiignore</code>. v0.4.1 prepares targeted prompts, asks before sending context when enabled, and never changes files without a manual action.</p>
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
                  <p title={terminalCwd}>Working directory: {terminalCwd} · Shell: {shellLabel(preferences.terminalShell)}</p>
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
                    <div className="git-status-card"><span>Branch</span><strong>{gitStatus.branch}{gitStatus.ahead_behind ? ` · ${gitStatus.ahead_behind}` : ''}</strong></div>
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
                          <span>{commit.date} · {commit.author}</span>
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
                <div className="panel-title"><Wrench size={16} /> Registry Overview</div>
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
                  <button className="danger-button" onClick={resetToolRegistry}><Trash2 size={14} /> Reset Registry</button>
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
                  <button onClick={addCustomRegistryTool}><FilePlus2 size={14} /> Add to Registry</button>
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
                            <span>{item.category} • {item.builtIn ? 'Built-in' : 'Custom'}</span>
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

              <section className="panel settings-panel wide-settings-panel">
                <div className="panel-title"><LayoutTemplate size={16} /> Workspace Menu Order</div>
                <p className="muted-note">Arrange the top workspace buttons. The first item appears farthest left in the main toolbar.</p>
                <div className="menu-order-list">
                  {normalizePageOrder(preferences.menuPageOrder).map((page, index) => (
                    <div key={page} className="menu-order-row">
                      <span className="menu-order-position">{index + 1}</span>
                      <span className="menu-order-label">{workspacePageIcon(page)} {workspacePageLabel(page)}</span>
                      <button onClick={() => moveMenuPage(page, 'left')} disabled={index === 0}>Move Left</button>
                      <button onClick={() => moveMenuPage(page, 'right')} disabled={index === normalizePageOrder(preferences.menuPageOrder).length - 1}>Move Right</button>
                    </div>
                  ))}
                </div>
                <div className="settings-actions">
                  <button onClick={resetMenuPageOrder}><RefreshCw size={14} /> Reset Menu Order</button>
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
                <label className="setting-row">
                  <span>Ollama model</span>
                  <input value={preferences.aiOllamaModel} onChange={(event) => updatePreference('aiOllamaModel', event.target.value)} spellCheck={false} />
                </label>
                <label className="setting-row">
                  <span>Default AI context</span>
                  <select value={preferences.aiDefaultContext} onChange={(event) => updatePreference('aiDefaultContext', event.target.value as AiContextPreference)}>
                    <option value="selection">Selected code</option>
                    <option value="currentFile">Current file</option>
                    <option value="problems">Problems output</option>
                    <option value="terminal">Terminal output</option>
                    <option value="git">Git status</option>
                  </select>
                </label>
                <label className="setting-check">
                  <input type="checkbox" checked={preferences.aiRequireConfirmation} onChange={(event) => updatePreference('aiRequireConfirmation', event.target.checked)} />
                  Require confirmation before sending code/context to AI
                </label>
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
                <p className="muted-note">Settings are stored locally on this computer. No telemetry or account sync is included.</p>
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
    </main>
  );
}
