export type LanguageDescriptor = {
  id: string;
  label: string;
  group: string;
  extensions: string[];
  monacoBuiltin?: boolean;
};

export const LANGUAGE_DESCRIPTORS: LanguageDescriptor[] = [
  { id: 'powershell', label: 'PowerShell', group: 'Administrator / Automation', extensions: ['ps1', 'psm1', 'psd1'] },
  { id: 'csharp', label: 'C#', group: '.NET / Desktop', extensions: ['cs'] },
  { id: 'xml', label: 'XML / XAML / Project', group: '.NET / Markup', extensions: ['xml', 'xaml', 'csproj', 'props', 'targets', 'config', 'resx'], monacoBuiltin: true },
  { id: 'rust', label: 'Rust', group: 'Tauri / Systems', extensions: ['rs'] },
  { id: 'typescript', label: 'TypeScript', group: 'Web / Tauri Frontend', extensions: ['ts'], monacoBuiltin: true },
  { id: 'typescript', label: 'TSX', group: 'Web / Tauri Frontend', extensions: ['tsx'], monacoBuiltin: true },
  { id: 'javascript', label: 'JavaScript', group: 'Web / Scripts', extensions: ['js', 'jsx', 'mjs', 'cjs'], monacoBuiltin: true },
  { id: 'html', label: 'HTML', group: 'Web / Markup', extensions: ['html', 'htm'], monacoBuiltin: true },
  { id: 'css', label: 'CSS', group: 'Web / Styles', extensions: ['css', 'scss', 'sass', 'less'], monacoBuiltin: true },
  { id: 'json', label: 'JSON', group: 'Data / Config', extensions: ['json', 'jsonc'], monacoBuiltin: true },
  { id: 'toml', label: 'TOML', group: 'Data / Config', extensions: ['toml'] },
  { id: 'yaml', label: 'YAML', group: 'Data / Config', extensions: ['yml', 'yaml'] },
  { id: 'markdown', label: 'Markdown', group: 'Documentation', extensions: ['md', 'markdown'], monacoBuiltin: true },
  { id: 'inno', label: 'INNO Setup', group: 'Installer / Release', extensions: ['iss'] },
  { id: 'bat', label: 'Batch / CMD', group: 'Administrator / Automation', extensions: ['bat', 'cmd'] },
  { id: 'python', label: 'Python', group: 'Scripts', extensions: ['py', 'pyw'], monacoBuiltin: true },
  { id: 'sql', label: 'SQL', group: 'Data', extensions: ['sql'], monacoBuiltin: true },
  { id: 'ini', label: 'INI / INF', group: 'Config', extensions: ['ini', 'inf'] },
  { id: 'dockerfile', label: 'Dockerfile', group: 'Build / Deployment', extensions: ['dockerfile'], monacoBuiltin: true },
  { id: 'plaintext', label: 'Plain Text', group: 'General', extensions: ['txt', 'log'] },
];

const extensionMap: Record<string, string> = LANGUAGE_DESCRIPTORS.reduce((map, descriptor) => {
  descriptor.extensions.forEach((extension) => {
    map[extension.toLowerCase()] = descriptor.id;
  });
  return map;
}, {} as Record<string, string>);

const labelMap: Record<string, string> = LANGUAGE_DESCRIPTORS.reduce((map, descriptor) => {
  if (!map[descriptor.id]) map[descriptor.id] = descriptor.label;
  return map;
}, {} as Record<string, string>);

export function extensionFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() ?? normalized;
  if (fileName.toLowerCase() === 'dockerfile') return 'dockerfile';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function languageFromPath(path: string): string {
  const ext = extensionFromPath(path);
  if (!ext) return 'plaintext';
  return extensionMap[ext] ?? 'plaintext';
}

export function languageLabelFromId(language?: string): string {
  if (!language) return 'Plain Text';
  return labelMap[language] ?? language;
}

export function languageLabelFromPath(path: string): string {
  return languageLabelFromId(languageFromPath(path));
}

export function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

export function supportedLanguageGroups(): Array<{ group: string; languages: LanguageDescriptor[] }> {
  const groups = new Map<string, LanguageDescriptor[]>();
  LANGUAGE_DESCRIPTORS.forEach((descriptor) => {
    if (!groups.has(descriptor.group)) groups.set(descriptor.group, []);
    groups.get(descriptor.group)!.push(descriptor);
  });
  return Array.from(groups.entries()).map(([group, languages]) => ({ group, languages }));
}

let languagesRegistered = false;

function hasLanguage(monaco: any, id: string): boolean {
  try {
    return monaco.languages.getLanguages().some((language: any) => language.id === id);
  } catch {
    return false;
  }
}

function ensureLanguage(monaco: any, id: string, extensions: string[], aliases: string[]) {
  if (!hasLanguage(monaco, id)) {
    monaco.languages.register({ id, extensions: extensions.map((extension) => `.${extension}`), aliases });
  }
}

export function registerDiligentLanguages(monaco: any) {
  if (!monaco?.languages || languagesRegistered) return;
  languagesRegistered = true;

  ensureLanguage(monaco, 'powershell', ['ps1', 'psm1', 'psd1'], ['PowerShell', 'powershell', 'ps1']);
  monaco.languages.setMonarchTokensProvider('powershell', {
    tokenizer: {
      root: [
        [/#[^\n]*/, 'comment'],
        [/\$[a-zA-Z_][\w:]*/, 'variable'],
        [/'[^']*'/, 'string'],
        [/"([^"`]|`.)*"/, 'string'],
        [/\b(function|param|process|begin|end|if|elseif|else|foreach|for|while|switch|try|catch|finally|return|throw|class|enum|using|namespace)\b/i, 'keyword'],
        [/\b(Get|Set|New|Remove|Start|Stop|Restart|Test|Invoke|Write|Read|Copy|Move|Compress|Expand|Import|Export)-[A-Za-z]+\b/, 'type.identifier'],
        [/[{}()[\]]/, '@brackets'],
        [/\d+/, 'number'],
      ],
    },
  });

  ensureLanguage(monaco, 'csharp', ['cs'], ['C#', 'csharp']);
  monaco.languages.setMonarchTokensProvider('csharp', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/\b(namespace|using|class|struct|record|interface|enum|public|private|protected|internal|static|readonly|async|await|void|string|int|long|bool|double|decimal|var|new|return|if|else|foreach|for|while|switch|try|catch|finally|throw|null|true|false)\b/, 'keyword'],
        [/[A-Z][\w]*/, 'type.identifier'],
        [/[{}()[\]]/, '@brackets'],
        [/\d+/, 'number'],
      ],
      comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']],
      string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
    },
  });

  ensureLanguage(monaco, 'rust', ['rs'], ['Rust', 'rust']);
  monaco.languages.setMonarchTokensProvider('rust', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/\b(fn|let|mut|pub|use|mod|struct|enum|impl|trait|async|await|match|if|else|loop|while|for|in|return|crate|super|self|Self|Result|Option|Some|None|Ok|Err|true|false)\b/, 'keyword'],
        [/\b(String|PathBuf|Vec|HashMap|usize|u32|i32|bool|str)\b/, 'type.identifier'],
        [/[{}()[\]]/, '@brackets'],
        [/\d+/, 'number'],
      ],
      comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']],
    },
  });

  ensureLanguage(monaco, 'toml', ['toml'], ['TOML', 'toml']);
  monaco.languages.setMonarchTokensProvider('toml', {
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\[[^\]]+\]/, 'keyword'],
        [/^[\w.-]+(?=\s*=)/, 'attribute.name'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\b(true|false)\b/, 'keyword'],
        [/\d+(\.\d+)?/, 'number'],
      ],
    },
  });

  ensureLanguage(monaco, 'yaml', ['yml', 'yaml'], ['YAML', 'yaml']);
  monaco.languages.setMonarchTokensProvider('yaml', {
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/^[\t ]*[\w.-]+:/, 'attribute.name'],
        [/-\s+/, 'delimiter'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\b(true|false|null)\b/, 'keyword'],
        [/\d+(\.\d+)?/, 'number'],
      ],
    },
  });

  ensureLanguage(monaco, 'inno', ['iss'], ['INNO Setup', 'inno', 'iss']);
  monaco.languages.setMonarchTokensProvider('inno', {
    tokenizer: {
      root: [
        [/;.*/, 'comment'],
        [/\[[^\]]+\]/, 'keyword'],
        [/^[A-Za-z][\w]*=/, 'attribute.name'],
        [/"[^"]*"/, 'string'],
        [/\{[^}]+\}/, 'variable'],
        [/\b(Name|Source|DestDir|Filename|Parameters|Flags|AppName|AppVersion|DefaultDirName|OutputDir|OutputBaseFilename)\b/, 'type.identifier'],
      ],
    },
  });

  ensureLanguage(monaco, 'bat', ['bat', 'cmd'], ['Batch', 'bat', 'cmd']);
  monaco.languages.setMonarchTokensProvider('bat', {
    tokenizer: {
      root: [
        [/::.*$/, 'comment'],
        [/REM\b.*$/i, 'comment'],
        [/%[^%]+%/, 'variable'],
        [/"[^"]*"/, 'string'],
        [/\b(ECHO|SET|IF|ELSE|FOR|IN|DO|CALL|GOTO|EXIT|PUSHD|POPD|START|WHERE|COPY|MOVE|DEL|MKDIR|RMDIR)\b/i, 'keyword'],
      ],
    },
  });

  ensureLanguage(monaco, 'ini', ['ini', 'inf'], ['INI', 'ini']);
  monaco.languages.setMonarchTokensProvider('ini', {
    tokenizer: {
      root: [
        [/[#;].*$/, 'comment'],
        [/\[[^\]]+\]/, 'keyword'],
        [/^[A-Za-z0-9_.-]+(?=\s*=)/, 'attribute.name'],
        [/"[^"]*"/, 'string'],
      ],
    },
  });
}
