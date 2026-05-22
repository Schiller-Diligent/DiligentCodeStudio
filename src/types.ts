export type WorkspaceEntry = {
  name: string;
  path: string;
  relative_path: string;
  is_dir: boolean;
  size: number;
  depth: number;
};

export type OpenFile = {
  path: string;
  name: string;
  language: string;
  content: string;
  dirty: boolean;
  sha256?: string;
};

export type ActivityItem = {
  at: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
};

export type TerminalResult = {
  command: string;
  cwd: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  success: boolean;
};

export type ProjectInfo = {
  path: string;
  has_package_json: boolean;
  has_cargo_toml: boolean;
  has_tauri_project: boolean;
  cargo_working_directory: string;
  has_solution: boolean;
  has_csproj: boolean;
  has_git_repository: boolean;
  has_powershell_scripts: boolean;
  project_types: string[];
  recommended_commands: string[];
  warnings: string[];
};

export type ToolStatus = {
  name: string;
  command: string;
  available: boolean;
  version: string;
  hint: string;
};

export type PlatformInfo = {
  os: string;
  family: string;
  arch: string;
  default_shell: string;
  npm_command: string;
  open_folder_command: string;
  path_separator: string;
  executable_extension: string;
  release_bundle_note: string;
};


export type SearchResult = {
  path: string;
  name: string;
  relative_path: string;
  line_number: number;
  column: number;
  preview: string;
};


export type GitChangedFile = {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
};

export type GitCommit = {
  hash: string;
  date: string;
  author: string;
  message: string;
};

export type GitStatusInfo = {
  git_root: string;
  branch: string;
  ahead_behind: string;
  clean: boolean;
  changed_files: GitChangedFile[];
  recent_commits: GitCommit[];
  tags: string[];
};


export type ReleaseInfo = {
  workspace_path: string;
  app_version: string;
  has_package_json: boolean;
  has_tauri_config: boolean;
  has_bundle_artifacts: boolean;
  bundle_directory: string;
  release_root: string;
  artifact_count: number;
  warnings: string[];
};

export type ReleasePackageResult = {
  release_directory: string;
  zip_path: string;
  checksum_file: string;
  notes_file: string;
  copied_files: string[];
  messages: string[];
};

export type DiagnosticProblem = {
  severity: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  file_path: string;
  relative_path: string;
  line_number: number;
  column: number;
  command: string;
};

export type DiagnosticRunResult = {
  workspace_path: string;
  commands_run: string[];
  exit_code: number;
  problem_count: number;
  error_count: number;
  warning_count: number;
  problems: DiagnosticProblem[];
  output: string;
  messages: string[];
};

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  files: string[];
};

export type ProjectTemplateResult = {
  project_path: string;
  template_id: string;
  template_name: string;
  created_files: string[];
};


export type ToolRegistryItem = {
  id: string;
  name: string;
  category: string;
  command: string;
  description: string;
  enabled: boolean;
  builtIn: boolean;
};
