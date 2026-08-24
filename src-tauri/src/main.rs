#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn dcs_find_workspace_root() -> Result<std::path::PathBuf, String> {
    let current = std::env::current_dir()
        .map_err(|error| format!("Could not read current directory: {error}"))?;

    let mut cursor = Some(current.as_path());

    while let Some(dir) = cursor {
        let has_package = dir.join("package.json").exists();
        let has_src = dir.join("src").exists();
        let has_tauri = dir.join("src-tauri").exists();

        if has_package && has_src {
            return Ok(dir.to_path_buf());
        }

        if has_package && has_tauri {
            return Ok(dir.to_path_buf());
        }

        cursor = dir.parent();
    }

    Err("Could not locate the Diligent Code Studio workspace root.".to_string())
}

fn dcs_is_safe_relative_path(path: &std::path::Path) -> bool {
    path.components().all(|component| {
        matches!(
            component,
            std::path::Component::Normal(_) | std::path::Component::CurDir
        )
    })
}

fn dcs_resolve_source_path(file: &str) -> Result<std::path::PathBuf, String> {
    let cleaned = file.trim().replace('\\', "/");

    if cleaned.is_empty() {
        return Err("Source file path was empty.".to_string());
    }

    if cleaned.contains('\0') {
        return Err("Source file path contained an invalid null character.".to_string());
    }

    let workspace_root = dcs_find_workspace_root()?;
    let root_canonical = workspace_root
        .canonicalize()
        .map_err(|error| format!("Could not canonicalize workspace root: {error}"))?;

    let input_path = std::path::PathBuf::from(&cleaned);

    let candidate = if input_path.is_absolute() {
        input_path
    } else {
        if !dcs_is_safe_relative_path(&input_path) {
            return Err(format!("Unsafe relative source path rejected: {cleaned}"));
        }

        workspace_root.join(input_path)
    };

    let resolved = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|error| format!("Could not canonicalize source path {cleaned}: {error}"))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| format!("Source path did not have a parent directory: {cleaned}"))?;

        let parent_canonical = parent
            .canonicalize()
            .map_err(|error| format!("Could not find source parent directory for {cleaned}: {error}"))?;

        let file_name = candidate
            .file_name()
            .ok_or_else(|| format!("Source path did not include a file name: {cleaned}"))?;

        parent_canonical.join(file_name)
    };

    if !resolved.starts_with(&root_canonical) {
        return Err(format!(
            "Source path is outside the workspace and was rejected: {}",
            resolved.display()
        ));
    }

    Ok(resolved)
}

#[tauri::command]
fn dcs_read_text_file(file: String) -> Result<(String, String), String> {
    let path = dcs_resolve_source_path(&file)?;
    let content = read_text_file_with_recovery(&path)?;

    Ok((path.to_string_lossy().to_string(), content))
}

#[tauri::command]
fn dcs_write_text_file(file: String, content: String) -> Result<(), String> {
    let path = dcs_resolve_source_path(&file)?;
    write_text_file_safely(&path, content)
}
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_WORKSPACE_ENTRIES: usize = 5000;
const MAX_WORKSPACE_DEPTH: usize = 14;
const MAX_PROJECT_SCAN_DEPTH: usize = 5;
const MAX_SEARCH_RESULTS: usize = 500;
const MAX_SEARCH_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_TERMINAL_COMMAND_LENGTH: usize = 8000;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[derive(Debug, Serialize)]
struct TerminalResult {
    command: String,
    cwd: String,
    exit_code: i32,
    stdout: String,
    stderr: String,
    success: bool,
}

#[derive(Debug, Serialize)]
struct WorkspaceEntry {
    name: String,
    path: String,
    relative_path: String,
    is_dir: bool,
    size: u64,
    depth: usize,
}

#[derive(Debug, Serialize)]
struct ProjectInfo {
    path: String,
    has_package_json: bool,
    has_cargo_toml: bool,
    has_tauri_project: bool,
    cargo_working_directory: String,
    has_solution: bool,
    has_csproj: bool,
    has_git_repository: bool,
    has_powershell_scripts: bool,
    project_types: Vec<String>,
    recommended_commands: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ToolStatus {
    name: String,
    command: String,
    available: bool,
    version: String,
    hint: String,
}


#[derive(Debug, Serialize, Clone)]
struct SetupDependency {
    id: String,
    name: String,
    category: String,
    description: String,
    command: String,
    available: bool,
    version: String,
    required: bool,
    install_supported: bool,
    install_command: String,
    website: String,
    caution: String,
}

#[derive(Debug, Serialize)]
struct PlatformInfo {
    os: String,
    family: String,
    arch: String,
    default_shell: String,
    npm_command: String,
    open_folder_command: String,
    path_separator: String,
    executable_extension: String,
    release_bundle_note: String,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    path: String,
    name: String,
    relative_path: String,
    line_number: usize,
    column: usize,
    preview: String,
}


#[derive(Debug, Serialize)]
struct GitChangedFile {
    path: String,
    status: String,
    staged: bool,
    unstaged: bool,
}

#[derive(Debug, Serialize)]
struct GitCommit {
    hash: String,
    date: String,
    author: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct GitStatusInfo {
    git_root: String,
    branch: String,
    ahead_behind: String,
    clean: bool,
    changed_files: Vec<GitChangedFile>,
    recent_commits: Vec<GitCommit>,
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ReleaseInfo {
    workspace_path: String,
    app_version: String,
    has_package_json: bool,
    has_tauri_config: bool,
    has_bundle_artifacts: bool,
    bundle_directory: String,
    release_root: String,
    artifact_count: usize,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ReleasePackageResult {
    release_directory: String,
    zip_path: String,
    checksum_file: String,
    notes_file: String,
    copied_files: Vec<String>,
    messages: Vec<String>,
}


#[derive(Debug, Serialize, Clone)]
struct DiagnosticProblem {
    severity: String,
    source: String,
    message: String,
    file_path: String,
    relative_path: String,
    line_number: usize,
    column: usize,
    command: String,
}


#[derive(Debug, Serialize, Clone)]
struct ProjectTemplate {
    id: String,
    name: String,
    description: String,
    files: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ProjectTemplateResult {
    project_path: String,
    template_id: String,
    template_name: String,
    created_files: Vec<String>,
}

#[derive(Debug, Serialize)]
struct DiagnosticRunResult {
    workspace_path: String,
    commands_run: Vec<String>,
    exit_code: i32,
    problem_count: usize,
    error_count: usize,
    warning_count: usize,
    problems: Vec<DiagnosticProblem>,
    output: String,
    messages: Vec<String>,
}

fn normalize_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty.".to_string());
    }
    Ok(PathBuf::from(trimmed))
}

fn ensure_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("File does not exist.".to_string());
    }
    if !path.is_file() {
        return Err("Path is not a file.".to_string());
    }
    Ok(())
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    Ok(())
}

fn io_error(action: &str, path: &Path, error: std::io::Error) -> String {
    format!("Unable to {action} {}: {error}", path.display())
}

fn sibling_work_path(path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Path does not have a parent directory: {}", path.display()))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("Path does not include a file name: {}", path.display()))?;
    let mut work_name = OsString::from(".");
    work_name.push(file_name);
    work_name.push(suffix);
    Ok(parent.join(work_name))
}

fn recovery_path(path: &Path) -> Result<PathBuf, String> {
    sibling_work_path(path, ".dcs-backup")
}

fn unique_temp_path(path: &Path) -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error while saving {}: {error}", path.display()))?
        .as_nanos();
    sibling_work_path(
        path,
        &format!(".dcs-save-{}-{nanos}.tmp", std::process::id()),
    )
}

#[cfg(target_os = "windows")]
fn wide_null(value: &Path) -> Vec<u16> {
    value.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn replace_file_atomically(
    target: &Path,
    replacement: &Path,
    backup: Option<&Path>,
) -> Result<(), String> {
    type Bool = i32;
    type Dword = u32;
    type Lpvoid = *mut std::ffi::c_void;

    #[link(name = "Kernel32")]
    extern "system" {
        fn ReplaceFileW(
            replaced_file_name: *const u16,
            replacement_file_name: *const u16,
            backup_file_name: *const u16,
            replace_flags: Dword,
            exclude: Lpvoid,
            reserved: Lpvoid,
        ) -> Bool;
    }

    const REPLACEFILE_WRITE_THROUGH: Dword = 0x0000_0001;
    let target_wide = wide_null(target);
    let replacement_wide = wide_null(replacement);
    let backup_wide = backup.map(wide_null);
    let backup_pointer = backup_wide
        .as_ref()
        .map_or(std::ptr::null(), |value| value.as_ptr());
    let replaced = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            replacement_wide.as_ptr(),
            backup_pointer,
            REPLACEFILE_WRITE_THROUGH,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced == 0 {
        return Err(io_error(
            "atomically replace",
            target,
            std::io::Error::last_os_error(),
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_file_atomically(
    target: &Path,
    replacement: &Path,
    backup: Option<&Path>,
) -> Result<(), String> {
    if let Some(backup_path) = backup {
        fs::copy(target, backup_path)
            .map_err(|error| io_error("create recovery copy for", target, error))?;
        let backup_file = fs::File::open(backup_path)
            .map_err(|error| io_error("open recovery copy", backup_path, error))?;
        backup_file
            .sync_all()
            .map_err(|error| io_error("flush recovery copy", backup_path, error))?;
    }
    fs::rename(replacement, target)
        .map_err(|error| io_error("atomically replace", target, error))
}

fn write_text_file_atomically(path: &Path, contents: &str, keep_backup: bool) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err(format!("Parent directory does not exist: {}", parent.display()));
        }
        if !parent.is_dir() {
            return Err(format!("Parent path is not a directory: {}", parent.display()));
        }
    }

    let temp_path = unique_temp_path(path)?;
    let result = (|| {
        let mut temp_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| io_error("create temporary save file", &temp_path, error))?;
        temp_file
            .write_all(contents.as_bytes())
            .map_err(|error| io_error("write temporary save file", &temp_path, error))?;
        temp_file
            .flush()
            .map_err(|error| io_error("flush temporary save file", &temp_path, error))?;
        temp_file
            .sync_all()
            .map_err(|error| io_error("sync temporary save file", &temp_path, error))?;
        let written_length = temp_file
            .metadata()
            .map_err(|error| io_error("validate temporary save file", &temp_path, error))?
            .len();
        if written_length != contents.len() as u64 {
            return Err(format!(
                "Temporary save validation failed for {}: expected {} bytes but wrote {written_length}",
                path.display(),
                contents.len()
            ));
        }
        drop(temp_file);

        if path.exists() {
            let backup = if keep_backup {
                Some(recovery_path(path)?)
            } else {
                None
            };
            if let Some(backup_path) = backup.as_ref() {
                if backup_path.exists() {
                    fs::remove_file(backup_path)
                        .map_err(|error| io_error("replace stale recovery copy", backup_path, error))?;
                }
            }
            replace_file_atomically(path, &temp_path, backup.as_deref())
        } else {
            fs::rename(&temp_path, path)
                .map_err(|error| io_error("finish atomic save for", path, error))
        }
    })();

    if result.is_err() && temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn write_text_file_safely(path: &Path, contents: String) -> Result<(), String> {
    write_text_file_atomically(path, &contents, true)
}

fn read_text_file_with_recovery(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(contents),
        Err(primary_error) => {
            let backup = recovery_path(path)?;
            let recovered = fs::read_to_string(&backup).map_err(|backup_error| {
                format!(
                    "Unable to read UTF-8 text file {}: {primary_error}. Recovery copy {} was also unavailable: {backup_error}",
                    path.display(),
                    backup.display()
                )
            })?;
            write_text_file_atomically(path, &recovered, false).map_err(|restore_error| {
                format!(
                    "Read recovery copy {} but could not restore {}: {restore_error}",
                    backup.display(),
                    path.display()
                )
            })?;
            Ok(recovered)
        }
    }
}

fn validate_child_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("Name cannot be empty.".to_string());
    }

    if trimmed == "." || trimmed == ".." {
        return Err("Name cannot be . or ...".to_string());
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Name cannot contain path separators.".to_string());
    }

    let invalid = ['<', '>', ':', '"', '|', '?', '*'];
    if trimmed.chars().any(|character| invalid.contains(&character)) {
        return Err("Name contains a Windows-invalid character: < > : \" | ? *".to_string());
    }

    Ok(trimmed.to_string())
}

fn should_skip_directory(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".hg"
            | ".svn"
            | ".idea"
            | ".vs"
            | "node_modules"
            | "target"
            | "bin"
            | "obj"
            | "dist"
            | "build"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | ".turbo"
    )
}

fn entry_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn relative_path(base: &Path, path: &Path) -> String {
    path.strip_prefix(base)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn collect_workspace_entries(
    base: &Path,
    current: &Path,
    depth: usize,
    entries: &mut Vec<WorkspaceEntry>,
) -> Result<(), String> {
    if entries.len() >= MAX_WORKSPACE_ENTRIES || depth > MAX_WORKSPACE_DEPTH {
        return Ok(());
    }

    let read_dir = match fs::read_dir(current) {
        Ok(items) => items,
        Err(_) => return Ok(()),
    };

    let mut directories: Vec<PathBuf> = Vec::new();
    let mut files: Vec<PathBuf> = Vec::new();

    for item in read_dir.flatten() {
        let path = item.path();
        let name = entry_name(&path);
        let metadata = match item.metadata() {
            Ok(value) => value,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            if should_skip_directory(&name) {
                continue;
            }
            directories.push(path);
        } else {
            files.push(path);
        }
    }

    directories.sort_by_key(|path| entry_name(path).to_lowercase());
    files.sort_by_key(|path| entry_name(path).to_lowercase());

    for path in directories.iter().chain(files.iter()) {
        if entries.len() >= MAX_WORKSPACE_ENTRIES {
            break;
        }

        let metadata = match fs::metadata(path) {
            Ok(value) => value,
            Err(_) => continue,
        };

        entries.push(WorkspaceEntry {
            name: entry_name(path),
            path: path.to_string_lossy().to_string(),
            relative_path: relative_path(base, path),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            depth,
        });

        if metadata.is_dir() {
            collect_workspace_entries(base, path, depth + 1, entries)?;
        }
    }

    Ok(())
}

fn root_has_file(root: &Path, file_name: &str) -> bool {
    root.join(file_name).is_file()
}

fn root_has_directory(root: &Path, dir_name: &str) -> bool {
    root.join(dir_name).is_dir()
}

fn scan_for_extension(root: &Path, extension: &str, max_depth: usize) -> bool {
    fn visit(path: &Path, extension: &str, depth: usize, max_depth: usize) -> bool {
        if depth > max_depth {
            return false;
        }

        let read_dir = match fs::read_dir(path) {
            Ok(value) => value,
            Err(_) => return false,
        };

        for item in read_dir.flatten() {
            let item_path = item.path();
            let name = entry_name(&item_path);
            let Ok(metadata) = item.metadata() else {
                continue;
            };

            if metadata.is_dir() {
                if should_skip_directory(&name) {
                    continue;
                }
                if visit(&item_path, extension, depth + 1, max_depth) {
                    return true;
                }
            } else if item_path
                .extension()
                .map(|value| value.to_string_lossy().eq_ignore_ascii_case(extension))
                .unwrap_or(false)
            {
                return true;
            }
        }

        false
    }

    visit(root, extension, 0, max_depth)
}

fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut current = Some(start);
    while let Some(path) = current {
        if root_has_directory(path, ".git") || root_has_file(path, ".git") {
            return Some(path.to_path_buf());
        }
        current = path.parent();
    }
    None
}

#[tauri::command]
fn detect_project(path: String) -> Result<ProjectInfo, String> {
    let dir = normalize_path(&path)?;
    ensure_directory(&dir)?;

    let has_package_json = root_has_file(&dir, "package.json");
    let has_root_cargo_toml = root_has_file(&dir, "Cargo.toml");
    let tauri_dir = dir.join("src-tauri");
    let has_tauri_project = root_has_file(&tauri_dir, "Cargo.toml");
    let has_cargo_toml = has_root_cargo_toml || has_tauri_project;
    let cargo_working_directory = if has_root_cargo_toml {
        dir.clone()
    } else if has_tauri_project {
        tauri_dir.clone()
    } else {
        dir.clone()
    };
    let has_solution = scan_for_extension(&dir, "sln", MAX_PROJECT_SCAN_DEPTH);
    let has_csproj = scan_for_extension(&dir, "csproj", MAX_PROJECT_SCAN_DEPTH);
    let has_powershell_scripts = scan_for_extension(&dir, "ps1", MAX_PROJECT_SCAN_DEPTH);
    let has_git_repository = find_git_root(&dir).is_some();

    let mut project_types: Vec<String> = Vec::new();
    let mut recommended_commands: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let npm = npm_executable();

    if has_package_json {
        project_types.push("Node / npm".to_string());
        recommended_commands.push(format!("{} install", npm));
        recommended_commands.push(format!("{} run build", npm));
    }

    if has_cargo_toml {
        if has_tauri_project && !has_root_cargo_toml {
            project_types.push("Tauri / Rust".to_string());
            recommended_commands.push("Set-Location -LiteralPath src-tauri; cargo build".to_string());
        } else {
            project_types.push("Rust / Cargo".to_string());
            recommended_commands.push("cargo build".to_string());
        }
    }

    if has_solution || has_csproj {
        project_types.push(".NET".to_string());
        recommended_commands.push("dotnet build".to_string());
    }

    if has_powershell_scripts {
        project_types.push("PowerShell".to_string());
        recommended_commands.push("Get-ChildItem -Recurse -Filter *.ps1".to_string());
    }

    if has_git_repository {
        project_types.push("Git repository".to_string());
        recommended_commands.insert(0, "git status".to_string());
    } else {
        recommended_commands.push("git init".to_string());
        warnings.push("This folder is not currently detected as a Git repository.".to_string());
    }

    if project_types.is_empty() {
        project_types.push("General folder".to_string());
        warnings.push("No package.json, Cargo.toml, .sln, .csproj, or PowerShell scripts were detected in this workspace scan.".to_string());
    }

    recommended_commands.push("Get-ChildItem".to_string());
    recommended_commands.sort();
    recommended_commands.dedup();

    Ok(ProjectInfo {
        path: dir.to_string_lossy().to_string(),
        has_package_json,
        has_cargo_toml,
        has_tauri_project,
        cargo_working_directory: cargo_working_directory.to_string_lossy().to_string(),
        has_solution,
        has_csproj,
        has_git_repository,
        has_powershell_scripts,
        project_types,
        recommended_commands,
        warnings,
    })
}

fn command_version(command: &str, args: &[&str]) -> String {
    let output = hidden_command(command).args(args).output();
    match output {
        Ok(value) => {
            let stdout = String::from_utf8_lossy(&value.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&value.stderr).trim().to_string();
            if !stdout.is_empty() {
                stdout.lines().next().unwrap_or("Installed").to_string()
            } else if !stderr.is_empty() {
                stderr.lines().next().unwrap_or("Installed").to_string()
            } else if value.status.success() {
                "Installed".to_string()
            } else {
                "Installed, but version check failed".to_string()
            }
        }
        Err(_) => "Not available".to_string(),
    }
}

fn tool_available(command: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        hidden_command("where.exe")
            .arg(command)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        hidden_command("which")
            .arg(command)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
}

fn npm_executable() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "npm.cmd"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "npm"
    }
}

fn default_shell_command() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "powershell.exe"
    }

    #[cfg(target_os = "macos")]
    {
        "zsh"
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        "bash"
    }
}

fn open_folder_command_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "explorer.exe"
    }

    #[cfg(target_os = "macos")]
    {
        "open"
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        "xdg-open"
    }
}

#[tauri::command]
fn get_platform_info() -> Result<PlatformInfo, String> {
    let release_bundle_note = if cfg!(target_os = "windows") {
        "Windows builds commonly produce MSI/NSIS/EXE-style artifacts under src-tauri/target/release/bundle."
    } else if cfg!(target_os = "macos") {
        "macOS builds commonly produce .app/.dmg artifacts under src-tauri/target/release/bundle."
    } else {
        "Linux builds commonly produce AppImage, deb, or rpm artifacts under src-tauri/target/release/bundle."
    };

    Ok(PlatformInfo {
        os: std::env::consts::OS.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        default_shell: default_shell_command().to_string(),
        npm_command: npm_executable().to_string(),
        open_folder_command: open_folder_command_name().to_string(),
        path_separator: std::path::MAIN_SEPARATOR.to_string(),
        executable_extension: std::env::consts::EXE_EXTENSION.to_string(),
        release_bundle_note: release_bundle_note.to_string(),
    })
}

fn make_tool_status(name: &str, command: &str, version_args: &[&str], hint: &str) -> ToolStatus {
    let available = tool_available(command);
    let version = if available {
        command_version(command, version_args)
    } else {
        "Not found on PATH".to_string()
    };

    ToolStatus {
        name: name.to_string(),
        command: command.to_string(),
        available,
        version,
        hint: hint.to_string(),
    }
}

#[tauri::command]
fn check_development_tools() -> Result<Vec<ToolStatus>, String> {
    let mut tools = vec![
        make_tool_status("Git", "git", &["--version"], "Install Git and ensure it is on PATH."),
        make_tool_status("Node.js", "node", &["--version"], "Install Node.js LTS."),
        make_tool_status("npm", npm_executable(), &["--version"], "npm is installed with Node.js. Windows commonly uses npm.cmd; Linux/macOS commonly use npm."),
        make_tool_status("Cargo", "cargo", &["--version"], "Install Rust using rustup."),
        make_tool_status("dotnet", "dotnet", &["--version"], "Install the .NET SDK for C#/.NET projects."),
    ];

    #[cfg(target_os = "windows")]
    {
        tools.push(make_tool_status("Windows PowerShell", "powershell.exe", &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], "Windows PowerShell is the default Windows terminal shell."));
        tools.push(make_tool_status("PowerShell 7", "pwsh.exe", &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], "Install PowerShell 7 if you want to use pwsh.exe as the terminal shell."));
        tools.push(make_tool_status("Command Prompt", "cmd.exe", &["/C", "ver"], "cmd.exe is included with Windows."));
    }

    #[cfg(target_os = "macos")]
    {
        tools.push(make_tool_status("zsh", "zsh", &["--version"], "zsh is the default shell on modern macOS."));
        tools.push(make_tool_status("bash", "bash", &["--version"], "bash is useful for shell scripts and tooling."));
        tools.push(make_tool_status("PowerShell 7", "pwsh", &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], "Optional: install PowerShell 7 if you want pwsh-based workflows."));
        tools.push(make_tool_status("open", "open", &["--help"], "macOS open command is used to open folders in Finder."));
        tools.push(make_tool_status("zip", "zip", &["-v"], "zip is used for simple cross-platform release archive creation."));
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        tools.push(make_tool_status("bash", "bash", &["--version"], "bash is the default Linux terminal shell for Diligent Code Studio."));
        tools.push(make_tool_status("zsh", "zsh", &["--version"], "Optional shell if installed."));
        tools.push(make_tool_status("PowerShell 7", "pwsh", &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], "Optional: install PowerShell 7 if you want pwsh-based workflows."));
        tools.push(make_tool_status("xdg-open", "xdg-open", &["--version"], "xdg-open is used to open folders from Linux desktop environments."));
        tools.push(make_tool_status("zip", "zip", &["-v"], "zip is used for simple cross-platform release archive creation."));
    }

    Ok(tools)
}


#[cfg(target_os = "windows")]
fn detect_visual_studio_build_tools() -> Option<String> {
    let vswhere_paths = [
        r"C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe",
        r"C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe",
    ];

    for vswhere in vswhere_paths {
        if Path::new(vswhere).exists() {
            let output = hidden_command(vswhere)
                .args([
                    "-latest",
                    "-products",
                    "*",
                    "-requires",
                    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                    "-property",
                    "installationPath",
                ])
                .output();

            if let Ok(value) = output {
                if value.status.success() {
                    let install_path = String::from_utf8_lossy(&value.stdout).trim().to_string();
                    if !install_path.is_empty() {
                        return Some(format!("Installed at {}", install_path));
                    }
                }
            }
        }
    }

    let common_paths = [
        r"C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
        r"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
        r"C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
        r"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC",
    ];

    for path in common_paths {
        if Path::new(path).exists() {
            return Some(format!("Installed. MSVC tools found at {}", path));
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn setup_visual_studio_build_tools_dependency() -> SetupDependency {
    let mut dep = setup_dependency(
        "vsbuildtools",
        "Visual Studio C++ Build Tools",
        "Core Development",
        "Required on Windows for Rust/Tauri MSVC linking, including link.exe.",
        "link.exe",
        &[],
        true,
        "winget install --id Microsoft.VisualStudio.2022.BuildTools -e",
        "https://visualstudio.microsoft.com/visual-cpp-build-tools/",
        "If Build Tools are already installed, open Visual Studio Installer and confirm Desktop development with C++ / MSVC build tools are selected.",
    );

    if let Some(version) = detect_visual_studio_build_tools() {
        dep.available = true;
        dep.version = format!("{}; link.exe may only be visible inside Developer PowerShell/Command Prompt.", version);
    }

    dep
}

#[cfg(target_os = "windows")]
fn winget_existing_install_is_ok(stdout: &str, stderr: &str) -> bool {
    let combined = format!("{}\n{}", stdout, stderr).to_lowercase();
    combined.contains("found an existing package already installed")
        || combined.contains("no available upgrade found")
        || combined.contains("no newer package versions are available")
        || combined.contains("already installed")
}


fn setup_dependency(
    id: &str,
    name: &str,
    category: &str,
    description: &str,
    command: &str,
    version_args: &[&str],
    required: bool,
    install_command: &str,
    website: &str,
    caution: &str,
) -> SetupDependency {
    let available = if command.trim().is_empty() { false } else { tool_available(command) };
    let version = if available && !command.trim().is_empty() {
        command_version(command, version_args)
    } else {
        "Not installed or not found on PATH".to_string()
    };

    SetupDependency {
        id: id.to_string(),
        name: name.to_string(),
        category: category.to_string(),
        description: description.to_string(),
        command: command.to_string(),
        available,
        version,
        required,
        install_supported: !install_command.trim().is_empty(),
        install_command: install_command.to_string(),
        website: website.to_string(),
        caution: caution.to_string(),
    }
}


fn setup_ollama_dependency(install_command: &str, website: &str) -> SetupDependency {
    let mut dep = setup_dependency(
        "ollama",
        "Ollama",
        "AI Tools",
        "Optional local AI runtime for private/offline model-assisted coding.",
        "ollama",
        &["--version"],
        false,
        install_command,
        website,
        "Models are downloaded separately and may require several GB of disk space.",
    );

    match get_ollama_status("http://127.0.0.1:11434".to_string()) {
        Ok(status) => {
            if status.running || status.installed {
                dep.available = true;
                dep.version = if !status.version.trim().is_empty() {
                    status.version
                } else if status.running {
                    format!("Local API running at {}. CLI not found on PATH for this app session.", status.endpoint)
                } else {
                    status.message
                };
            } else {
                dep.available = false;
                dep.version = status.message;
            }
        }
        Err(error) => {
            if dep.available {
                dep.version = format!("{}; API status check failed: {}", dep.version, error);
            } else {
                dep.version = format!("Not installed or not found on PATH. API status check failed: {}", error);
            }
        }
    }

    dep
}

fn setup_dependency_definitions() -> Vec<SetupDependency> {
    let mut deps = Vec::new();

    #[cfg(target_os = "windows")]
    {
        deps.push(setup_dependency(
            "winget",
            "Windows Package Manager",
            "Install Helper",
            "Used by Diligent Code Studio to launch guided installs for common developer tools.",
            "winget",
            &["--version"],
            true,
            "",
            "https://learn.microsoft.com/windows/package-manager/winget/",
            "winget is normally installed with App Installer from Microsoft Store. If missing, install App Installer first.",
        ));
        deps.push(setup_dependency(
            "git",
            "Git",
            "Core Development",
            "Required for source control, Git page features, repository history, tags, and releases.",
            "git",
            &["--version"],
            true,
            "winget install --id Git.Git -e",
            "https://git-scm.com/download/win",
            "After installing Git, close and reopen Diligent Code Studio so PATH updates are detected.",
        ));
        deps.push(setup_dependency(
            "nodejs",
            "Node.js / npm",
            "Core Development",
            "Required to build the React/Vite frontend and run npm scripts.",
            "node",
            &["--version"],
            true,
            "winget install --id OpenJS.NodeJS.LTS -e",
            "https://nodejs.org/",
            "Install the LTS version. Restart terminals and Diligent Code Studio after installation.",
        ));
        deps.push(setup_dependency(
            "rust",
            "Rust / Cargo",
            "Core Development",
            "Required to build the Tauri desktop backend.",
            "cargo",
            &["--version"],
            true,
            "winget install --id Rustlang.Rustup -e",
            "https://www.rust-lang.org/tools/install",
            "Rustup updates PATH. Restart terminals and run rustup default stable-msvc if needed.",
        ));
        deps.push(setup_visual_studio_build_tools_dependency());
        deps.push(setup_dependency(
            "powershell7",
            "PowerShell 7",
            "Optional Build Tools",
            "Optional modern PowerShell shell for terminal workflows and scripts.",
            "pwsh.exe",
            &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
            false,
            "winget install --id Microsoft.PowerShell -e",
            "https://learn.microsoft.com/powershell/",
            "Windows PowerShell works without this, but PowerShell 7 is useful for cross-platform scripts.",
        ));
        deps.push(setup_dependency(
            "dotnet",
            ".NET SDK",
            "Optional Build Tools",
            "Optional SDK for C#/.NET projects and templates.",
            "dotnet",
            &["--version"],
            false,
            "winget install --id Microsoft.DotNet.SDK.9 -e",
            "https://dotnet.microsoft.com/download",
            "Install only if you plan to build C#/.NET projects from Diligent Code Studio.",
        ));
        deps.push(setup_ollama_dependency(
            "winget install --id Ollama.Ollama -e",
            "https://ollama.com/download/windows",
        ));
        deps.push(setup_dependency(
            "githubcli",
            "GitHub CLI",
            "Optional Build Tools",
            "Optional command-line helper for GitHub authentication, releases, and workflows.",
            "gh",
            &["--version"],
            false,
            "winget install --id GitHub.cli -e",
            "https://cli.github.com/",
            "Useful for advanced GitHub release and workflow automation.",
        ));
        deps.push(setup_dependency(
            "vercelcli",
            "Vercel CLI",
            "Web Builder",
            "Optional global deployment CLI for preview and production web deployments.",
            "vercel",
            &["--version"],
            false,
            "npm install -g vercel",
            "https://vercel.com/docs/cli",
            "Requires Node.js/npm and a Vercel account. CLI login may be required before deploying.",
        ));
        deps.push(setup_dependency(
            "netlifycli",
            "Netlify CLI",
            "Web Builder",
            "Optional global deployment CLI for Netlify previews and production deploys.",
            "netlify",
            &["--version"],
            false,
            "npm install -g netlify-cli",
            "https://docs.netlify.com/cli/get-started/",
            "Requires Node.js/npm and a Netlify account. CLI login may be required before deploying.",
        ));
        deps.push(setup_dependency(
            "pnpm",
            "pnpm",
            "Web Builder",
            "Optional fast package manager for modern web projects.",
            "pnpm",
            &["--version"],
            false,
            "npm install -g pnpm",
            "https://pnpm.io/installation",
            "Optional; npm remains supported. Restart terminals after global installation.",
        ));
        deps.push(setup_dependency(
            "innosetup",
            "Inno Setup",
            "Optional Packaging",
            "Optional Windows installer compiler for custom setup packages.",
            "ISCC.exe",
            &["/?"],
            false,
            "winget install --id JRSoftware.InnoSetup -e",
            "https://jrsoftware.org/isinfo.php",
            "Useful if you want custom Windows installer scripts beyond Tauri bundles.",
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        deps.push(setup_dependency("git", "Git", "Core Development", "Required for source control and Git page features.", "git", &["--version"], true, "", "https://git-scm.com/downloads", "Install with your operating system package manager."));
        deps.push(setup_dependency("nodejs", "Node.js / npm", "Core Development", "Required to build the React/Vite frontend.", "node", &["--version"], true, "", "https://nodejs.org/", "Install Node.js LTS with your platform package manager or official installer."));
        deps.push(setup_dependency("rust", "Rust / Cargo", "Core Development", "Required to build the Tauri desktop backend.", "cargo", &["--version"], true, "", "https://www.rust-lang.org/tools/install", "Install Rust with rustup."));
        deps.push(setup_dependency("powershell7", "PowerShell 7", "Optional Build Tools", "Optional shell for cross-platform PowerShell scripts.", "pwsh", &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], false, "", "https://learn.microsoft.com/powershell/", "Optional unless you want pwsh-based workflows."));
        deps.push(setup_dependency("dotnet", ".NET SDK", "Optional Build Tools", "Optional SDK for C#/.NET projects and templates.", "dotnet", &["--version"], false, "", "https://dotnet.microsoft.com/download", "Install only if you plan to build C#/.NET projects."));
        deps.push(setup_ollama_dependency("", "https://ollama.com/download"));
        deps.push(setup_dependency("githubcli", "GitHub CLI", "Optional Build Tools", "Optional command-line helper for GitHub authentication, releases, and workflows.", "gh", &["--version"], false, "", "https://cli.github.com/", "Useful for advanced GitHub release and workflow automation."));
        deps.push(setup_dependency("vercelcli", "Vercel CLI", "Web Builder", "Optional global deployment CLI for preview and production web deployments.", "vercel", &["--version"], false, "npm install -g vercel", "https://vercel.com/docs/cli", "Requires Node.js/npm and a Vercel account."));
        deps.push(setup_dependency("netlifycli", "Netlify CLI", "Web Builder", "Optional global deployment CLI for Netlify previews and production deploys.", "netlify", &["--version"], false, "npm install -g netlify-cli", "https://docs.netlify.com/cli/get-started/", "Requires Node.js/npm and a Netlify account."));
        deps.push(setup_dependency("pnpm", "pnpm", "Web Builder", "Optional fast package manager for modern web projects.", "pnpm", &["--version"], false, "npm install -g pnpm", "https://pnpm.io/installation", "Optional; npm remains supported."));
    }

    deps
}

#[tauri::command]
fn check_setup_dependencies() -> Result<Vec<SetupDependency>, String> {
    Ok(setup_dependency_definitions())
}

#[tauri::command]
fn install_setup_dependency(dependency_id: String) -> Result<TerminalResult, String> {
    let dep = setup_dependency_definitions()
        .into_iter()
        .find(|item| item.id == dependency_id)
        .ok_or_else(|| format!("Unknown dependency id: {}", dependency_id))?;

    if !dep.install_supported || dep.install_command.trim().is_empty() {
        return Err(format!("{} does not have an automatic installer for this platform. Use the Open Website button instead.", dep.name));
    }

    let cwd = std::env::current_dir().map_err(|error| error.to_string())?;
    let command_text = dep.install_command.clone();

    #[cfg(target_os = "windows")]
    let output = hidden_command("cmd.exe")
        .args(["/C", command_text.as_str()])
        .current_dir(&cwd)
        .output()
        .map_err(|error| format!("Unable to start installer command: {}", error))?;

    #[cfg(not(target_os = "windows"))]
    let output = hidden_command(default_shell_command())
        .arg("-lc")
        .arg(command_text.as_str())
        .current_dir(&cwd)
        .output()
        .map_err(|error| format!("Unable to start installer command: {}", error))?;

    let mut stdout_text = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_text = String::from_utf8_lossy(&output.stderr).to_string();
    let mut success = output.status.success();
    let mut exit_code = output.status.code().unwrap_or(-1);

    #[cfg(target_os = "windows")]
    {
        if !success && command_text.trim_start().to_lowercase().starts_with("winget ") && winget_existing_install_is_ok(&stdout_text, &stderr_text) {
            success = true;
            exit_code = 0;
            stdout_text.push_str("
Diligent Code Studio note: winget reported this package is already installed or up to date. Treating this as success.
");
        }
    }

    Ok(TerminalResult {
        command: command_text,
        cwd: cwd.to_string_lossy().to_string(),
        exit_code,
        stdout: stdout_text,
        stderr: stderr_text,
        success,
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Only http:// and https:// URLs can be opened from this command.".to_string());
    }

    #[cfg(target_os = "windows")]
    let status = hidden_command("cmd.exe")
        .args(["/C", "start", "", trimmed])
        .status()
        .map_err(|error| format!("Unable to open URL: {}", error))?;

    #[cfg(target_os = "macos")]
    let status = hidden_command("open")
        .arg(trimmed)
        .status()
        .map_err(|error| format!("Unable to open URL: {}", error))?;

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let status = hidden_command("xdg-open")
        .arg(trimmed)
        .status()
        .map_err(|error| format!("Unable to open URL: {}", error))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Open URL command exited with status: {}", status))
    }
}

#[tauri::command]
fn pick_workspace_folder() -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Select Diligent Code Studio Workspace")
        .pick_folder();

    Ok(picked.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn list_workspace(path: String) -> Result<Vec<WorkspaceEntry>, String> {
    let dir = normalize_path(&path)?;
    ensure_directory(&dir)?;

    let mut entries = Vec::new();
    collect_workspace_entries(&dir, &dir, 0, &mut entries)?;
    Ok(entries)
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<WorkspaceEntry>, String> {
    let dir = normalize_path(&path)?;
    ensure_directory(&dir)?;

    let mut entries = Vec::new();
    collect_workspace_entries(&dir, &dir, 0, &mut entries)?;
    Ok(entries)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let file = normalize_path(&path)?;
    if !file.exists() && !recovery_path(&file)?.exists() {
        ensure_file(&file)?;
    }
    read_text_file_with_recovery(&file)
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let file = normalize_path(&path)?;
    write_text_file_safely(&file, contents)
}

#[tauri::command]
fn save_text_file_as(suggested: String, contents: String) -> Result<Option<String>, String> {
    let file_name = if suggested.trim().is_empty() {
        "untitled.txt".to_string()
    } else {
        suggested.trim().to_string()
    };

    let picked = rfd::FileDialog::new()
        .set_title("Save File As")
        .set_file_name(file_name)
        .save_file();

    let Some(path) = picked else {
        return Ok(None);
    };

    write_text_file_safely(&path, contents)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn create_text_file(parent: String, name: String, contents: String) -> Result<String, String> {
    let directory = normalize_path(&parent)?;
    ensure_directory(&directory)?;
    let clean_name = validate_child_name(&name)?;
    let file_path = directory.join(clean_name);

    if file_path.exists() {
        return Err(format!("A file or folder already exists at {}", file_path.display()));
    }

    write_text_file_safely(&file_path, contents)?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_folder(parent: String, name: String) -> Result<String, String> {
    let directory = normalize_path(&parent)?;
    ensure_directory(&directory)?;
    let clean_name = validate_child_name(&name)?;
    let folder_path = directory.join(clean_name);

    if folder_path.exists() {
        return Err(format!("A file or folder already exists at {}", folder_path.display()));
    }

    fs::create_dir(&folder_path).map_err(|error| io_error("create folder", &folder_path, error))?;
    Ok(folder_path.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_path(path: String, name: String) -> Result<String, String> {
    let current_path = normalize_path(&path)?;
    if !current_path.exists() {
        return Err(format!("Path does not exist: {}", current_path.display()));
    }

    let parent = current_path
        .parent()
        .ok_or_else(|| "Cannot rename this path because it has no parent folder.".to_string())?;
    let clean_name = validate_child_name(&name)?;
    let new_path = parent.join(clean_name);

    if new_path.exists() {
        return Err(format!("A file or folder already exists at {}", new_path.display()));
    }

    fs::rename(&current_path, &new_path).map_err(|error| io_error("rename", &current_path, error))?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = normalize_path(&path)?;
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|error| io_error("delete folder", &target, error))?;
    } else {
        fs::remove_file(&target).map_err(|error| io_error("delete file", &target, error))?;
    }

    Ok(())
}


fn normalize_extension_filter(filter: &str) -> Vec<String> {
    filter
        .split(|character| character == ',' || character == ';' || character == ' ')
        .map(|item| item.trim().trim_start_matches('.').to_lowercase())
        .filter(|item| !item.is_empty())
        .collect()
}

fn extension_allowed(path: &Path, extensions: &[String]) -> bool {
    if extensions.is_empty() {
        return true;
    }

    path.extension()
        .map(|extension| extensions.contains(&extension.to_string_lossy().to_lowercase()))
        .unwrap_or(false)
}

fn is_word_character(character: Option<char>) -> bool {
    character
        .map(|value| value.is_ascii_alphanumeric() || value == '_')
        .unwrap_or(false)
}

fn whole_word_match(line: &str, start: usize, length: usize) -> bool {
    let before = if start == 0 { None } else { line[..start].chars().last() };
    let after_index = start + length;
    let after = if after_index >= line.len() { None } else { line[after_index..].chars().next() };

    !is_word_character(before) && !is_word_character(after)
}

fn preview_line(line: &str, column: usize) -> String {
    let cleaned = line.trim().replace('\t', "    ");
    if cleaned.chars().count() <= 180 {
        return cleaned;
    }

    let start = column.saturating_sub(70);
    let preview: String = cleaned.chars().skip(start).take(180).collect();
    if start > 0 {
        format!("...{preview}")
    } else {
        format!("{preview}...")
    }
}

fn search_file(
    workspace: &Path,
    file: &Path,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    results: &mut Vec<SearchResult>,
) {
    if results.len() >= MAX_SEARCH_RESULTS {
        return;
    }

    let metadata = match fs::metadata(file) {
        Ok(value) => value,
        Err(_) => return,
    };

    if metadata.len() > MAX_SEARCH_FILE_SIZE {
        return;
    }

    let contents = match fs::read_to_string(file) {
        Ok(value) => value,
        Err(_) => return,
    };

    let query_to_match = if case_sensitive { query.to_string() } else { query.to_lowercase() };
    let query_length = query_to_match.len();

    for (line_index, line) in contents.lines().enumerate() {
        if results.len() >= MAX_SEARCH_RESULTS {
            break;
        }

        let haystack = if case_sensitive { line.to_string() } else { line.to_lowercase() };
        let mut offset = 0;

        while offset <= haystack.len() {
            let Some(found_at) = haystack[offset..].find(&query_to_match) else {
                break;
            };

            let absolute = offset + found_at;
            if !whole_word || whole_word_match(&haystack, absolute, query_length) {
                results.push(SearchResult {
                    path: file.to_string_lossy().to_string(),
                    name: entry_name(file),
                    relative_path: relative_path(workspace, file),
                    line_number: line_index + 1,
                    column: absolute + 1,
                    preview: preview_line(line, absolute),
                });
            }

            offset = absolute + query_length.max(1);

            if results.len() >= MAX_SEARCH_RESULTS {
                break;
            }
        }
    }
}

fn search_directory(
    workspace: &Path,
    current: &Path,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    extensions: &[String],
    depth: usize,
    results: &mut Vec<SearchResult>,
) {
    if results.len() >= MAX_SEARCH_RESULTS || depth > MAX_WORKSPACE_DEPTH {
        return;
    }

    let read_dir = match fs::read_dir(current) {
        Ok(value) => value,
        Err(_) => return,
    };

    for item in read_dir.flatten() {
        if results.len() >= MAX_SEARCH_RESULTS {
            break;
        }

        let path = item.path();
        let name = entry_name(&path);
        let metadata = match item.metadata() {
            Ok(value) => value,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            if should_skip_directory(&name) {
                continue;
            }
            search_directory(workspace, &path, query, case_sensitive, whole_word, extensions, depth + 1, results);
        } else if extension_allowed(&path, extensions) {
            search_file(workspace, &path, query, case_sensitive, whole_word, results);
        }
    }
}

#[tauri::command]
fn search_workspace(
    workspace_path: String,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    extension_filter: String,
) -> Result<Vec<SearchResult>, String> {
    let workspace = normalize_path(&workspace_path)?;
    ensure_directory(&workspace)?;

    let clean_query = query.trim();
    if clean_query.is_empty() {
        return Err("Search query cannot be empty.".to_string());
    }

    let extensions = normalize_extension_filter(&extension_filter);
    let mut results = Vec::new();

    search_directory(
        &workspace,
        &workspace,
        clean_query,
        case_sensitive,
        whole_word,
        &extensions,
        0,
        &mut results,
    );

    Ok(results)
}


fn git_root_for_path(path: &str) -> Result<PathBuf, String> {
    let provided = normalize_path(path)?;
    let start = if provided.is_file() {
        provided
            .parent()
            .map(|value| value.to_path_buf())
            .ok_or_else(|| "Unable to determine parent folder for Git path.".to_string())?
    } else {
        provided
    };

    let root = find_git_root(&start)
        .ok_or_else(|| "No Git repository was detected for this workspace. Use the Terminal page to run git init in the project folder first.".to_string())?;
    Ok(root)
}

fn run_git_command(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = hidden_command("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| format!("Unable to run git. Make sure Git is installed and on PATH: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        let message = if stderr.trim().is_empty() { stdout } else { stderr };
        Err(message.trim().to_string())
    }
}

fn run_git_command_allow_failure(root: &Path, args: &[&str]) -> String {
    run_git_command(root, args).unwrap_or_default()
}

fn parse_branch_line(line: &str) -> (String, String) {
    let clean = line.trim_start_matches("## ").trim();
    if clean.is_empty() {
        return ("Unknown".to_string(), "".to_string());
    }

    if clean.starts_with("No commits yet on ") {
        return (clean.replace("No commits yet on ", ""), "No commits yet".to_string());
    }

    let branch = clean
        .split("...")
        .next()
        .unwrap_or(clean)
        .split_whitespace()
        .next()
        .unwrap_or(clean)
        .to_string();

    let ahead_behind = clean
        .split('[')
        .nth(1)
        .map(|value| value.trim_end_matches(']').to_string())
        .unwrap_or_default();

    (branch, ahead_behind)
}

fn parse_git_status_line(line: &str) -> Option<GitChangedFile> {
    if line.len() < 3 {
        return None;
    }

    let bytes = line.as_bytes();
    let x = bytes.get(0).copied().unwrap_or(b' ') as char;
    let y = bytes.get(1).copied().unwrap_or(b' ') as char;
    let path_part = line.get(3..).unwrap_or("").trim();

    if path_part.is_empty() {
        return None;
    }

    let display_path = if let Some((_, new_path)) = path_part.split_once(" -> ") {
        new_path.trim().to_string()
    } else {
        path_part.to_string()
    };

    Some(GitChangedFile {
        path: display_path,
        status: format!("{}{}", x, y).trim().to_string(),
        staged: x != ' ' && x != '?',
        unstaged: y != ' ' || x == '?',
    })
}

fn parse_recent_commits(output: &str) -> Vec<GitCommit> {
    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, '\t');
            let hash = parts.next()?.to_string();
            let date = parts.next().unwrap_or("").to_string();
            let author = parts.next().unwrap_or("").to_string();
            let message = parts.next().unwrap_or("").to_string();
            Some(GitCommit { hash, date, author, message })
        })
        .collect()
}

fn git_status_for_root(root: &Path) -> Result<GitStatusInfo, String> {
    let status_output = run_git_command(root, &["status", "--short", "--branch"])?;
    let mut branch = "Unknown".to_string();
    let mut ahead_behind = String::new();
    let mut changed_files: Vec<GitChangedFile> = Vec::new();

    for line in status_output.lines() {
        if line.starts_with("## ") {
            let parsed = parse_branch_line(line);
            branch = parsed.0;
            ahead_behind = parsed.1;
        } else if let Some(item) = parse_git_status_line(line) {
            changed_files.push(item);
        }
    }

    let commits_output = run_git_command_allow_failure(
        root,
        &["log", "-n", "10", "--pretty=format:%h%x09%ad%x09%an%x09%s", "--date=short"],
    );
    let tags_output = run_git_command_allow_failure(root, &["tag", "--list", "--sort=-creatordate"]);
    let recent_commits = parse_recent_commits(&commits_output);
    let tags = tags_output
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .take(25)
        .collect();

    Ok(GitStatusInfo {
        git_root: root.to_string_lossy().to_string(),
        branch,
        ahead_behind,
        clean: changed_files.is_empty(),
        changed_files,
        recent_commits,
        tags,
    })
}


#[tauri::command]
fn git_init(workspace_path: String) -> Result<GitStatusInfo, String> {
    let root = normalize_path(&workspace_path)?;
    ensure_directory(&root)?;
    run_git_command(&root, &["init"])?;
    git_status_for_root(&root)
}

#[tauri::command]
fn git_status(workspace_path: String) -> Result<GitStatusInfo, String> {
    let root = git_root_for_path(&workspace_path)?;
    git_status_for_root(&root)
}

#[tauri::command]
fn git_stage_all(workspace_path: String) -> Result<GitStatusInfo, String> {
    let root = git_root_for_path(&workspace_path)?;
    run_git_command(&root, &["add", "--all"])?;
    git_status_for_root(&root)
}

#[tauri::command]
fn git_stage_file(workspace_path: String, file_path: String) -> Result<GitStatusInfo, String> {
    let root = git_root_for_path(&workspace_path)?;
    let clean_path = file_path.trim();
    if clean_path.is_empty() {
        return Err("File path cannot be empty.".to_string());
    }
    run_git_command(&root, &["add", "--", clean_path])?;
    git_status_for_root(&root)
}

#[tauri::command]
fn git_unstage_file(workspace_path: String, file_path: String) -> Result<GitStatusInfo, String> {
    let root = git_root_for_path(&workspace_path)?;
    let clean_path = file_path.trim();
    if clean_path.is_empty() {
        return Err("File path cannot be empty.".to_string());
    }
    run_git_command(&root, &["restore", "--staged", "--", clean_path])?;
    git_status_for_root(&root)
}

#[tauri::command]
fn git_commit(workspace_path: String, message: String) -> Result<GitStatusInfo, String> {
    let root = git_root_for_path(&workspace_path)?;
    let clean_message = message.trim();
    if clean_message.is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }
    run_git_command(&root, &["commit", "-m", clean_message])?;
    git_status_for_root(&root)
}

#[tauri::command]
fn git_create_tag(workspace_path: String, tag_name: String) -> Result<GitStatusInfo, String> {
    let root = git_root_for_path(&workspace_path)?;
    let clean_tag = tag_name.trim();
    if clean_tag.is_empty() {
        return Err("Tag name cannot be empty.".to_string());
    }
    if clean_tag.chars().any(|value| value.is_whitespace()) {
        return Err("Tag name cannot contain spaces.".to_string());
    }
    run_git_command(&root, &["tag", clean_tag])?;
    git_status_for_root(&root)
}

fn shell_executable(shell: Option<String>) -> String {
    match shell.unwrap_or_default().trim().to_lowercase().as_str() {
        "pwsh" | "powershell7" | "powershell-7" => {
            #[cfg(target_os = "windows")]
            {
                "pwsh.exe".to_string()
            }
            #[cfg(not(target_os = "windows"))]
            {
                "pwsh".to_string()
            }
        }
        "powershell" | "windows-powershell" => {
            #[cfg(target_os = "windows")]
            {
                "powershell.exe".to_string()
            }
            #[cfg(not(target_os = "windows"))]
            {
                "pwsh".to_string()
            }
        }
        "cmd" | "commandprompt" => {
            #[cfg(target_os = "windows")]
            {
                "cmd.exe".to_string()
            }
            #[cfg(not(target_os = "windows"))]
            {
                default_shell_command().to_string()
            }
        }
        "bash" => "bash".to_string(),
        "zsh" => "zsh".to_string(),
        _ => default_shell_command().to_string(),
    }
}

fn normalize_command_for_platform(command_text: &str) -> String {
    let trimmed = command_text.trim();

    #[cfg(target_os = "windows")]
    {
        if trimmed == "npm" || trimmed.starts_with("npm ") {
            return trimmed.replacen("npm", npm_executable(), 1);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if trimmed == "npm.cmd" || trimmed.starts_with("npm.cmd ") {
            return trimmed.replacen("npm.cmd", npm_executable(), 1);
        }
        if trimmed.starts_with("Set-Location -LiteralPath") {
            return trimmed.replace("Set-Location -LiteralPath", "cd").replace(";", " &&");
        }
    }

    trimmed.to_string()
}

fn validate_terminal_command(command_text: &str) -> Result<String, String> {
    let trimmed = command_text.trim();
    if trimmed.is_empty() {
        return Err("Command cannot be empty.".to_string());
    }
    if trimmed.len() > MAX_TERMINAL_COMMAND_LENGTH {
        return Err(format!("Command is too long. Maximum length is {} characters.", MAX_TERMINAL_COMMAND_LENGTH));
    }
    if trimmed.contains('\0') {
        return Err("Command contains an invalid null character.".to_string());
    }
    if trimmed.chars().any(|ch| ch.is_control() && ch != '\t') {
        return Err("Command contains unsupported control characters.".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
fn run_terminal_command(cwd: String, command: String, shell: Option<String>) -> Result<TerminalResult, String> {
    let working_dir = normalize_path(&cwd)?;
    ensure_directory(&working_dir)?;

    let clean_command = validate_terminal_command(&normalize_command_for_platform(&command))?;

    let shell_command = shell_executable(shell);
    let shell_lower = shell_command.to_lowercase();
    let mut command_builder = hidden_command(&shell_command);

    if shell_lower == "cmd.exe" {
        command_builder.arg("/C").arg(&clean_command);
    } else if shell_lower.contains("powershell") || shell_lower == "pwsh" || shell_lower == "pwsh.exe" {
        command_builder.arg("-NoProfile");
        if shell_lower == "powershell.exe" {
            command_builder.arg("-ExecutionPolicy").arg("Bypass");
        }
        command_builder.arg("-Command").arg(&clean_command);
    } else {
        command_builder.arg("-lc").arg(&clean_command);
    }

    let output = command_builder
        .current_dir(&working_dir)
        .output()
        .map_err(|error| format!("Unable to run {shell_command}: {error}"))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(TerminalResult {
        command: clean_command.to_string(),
        cwd: working_dir.to_string_lossy().to_string(),
        exit_code,
        stdout,
        stderr,
        success: output.status.success(),
    })
}

#[tauri::command]
fn open_powershell_window(cwd: String, shell: Option<String>) -> Result<(), String> {
    let working_dir = normalize_path(&cwd)?;
    ensure_directory(&working_dir)?;
    let shell_command = shell_executable(shell);

    #[cfg(target_os = "windows")]
    {
        if shell_command.eq_ignore_ascii_case("cmd.exe") {
            Command::new("cmd.exe")
                .arg("/C")
                .arg("start")
                .arg("")
                .arg("cmd.exe")
                .current_dir(&working_dir)
                .spawn()
                .map_err(|error| format!("Unable to open Command Prompt: {error}"))?;
        } else {
            Command::new("cmd.exe")
                .arg("/C")
                .arg("start")
                .arg("")
                .arg(&shell_command)
                .arg("-NoExit")
                .arg("-NoProfile")
                .current_dir(&working_dir)
                .spawn()
                .map_err(|error| format!("Unable to open {shell_command} window: {error}"))?;
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = shell_command;
        Command::new("open")
            .arg("-a")
            .arg("Terminal")
            .arg(&working_dir)
            .spawn()
            .map_err(|error| format!("Unable to open macOS Terminal: {error}"))?;
        Ok(())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("x-terminal-emulator")
            .arg("--working-directory")
            .arg(&working_dir)
            .spawn()
            .map_err(|error| format!("Unable to open Linux terminal. Install x-terminal-emulator or launch {shell_command} manually: {error}"))?;
        Ok(())
    }
}


fn read_version_from_json(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("version")?.as_str().map(|value| value.to_string())
}

fn read_version_from_cargo_toml(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let mut in_package = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_package = trimmed == "[package]";
            continue;
        }
        if in_package && trimmed.starts_with("version") {
            let (_, value) = trimmed.split_once('=')?;
            return Some(value.trim().trim_matches('"').to_string());
        }
    }
    None
}

fn validated_release_version(workspace: &Path) -> Result<String, String> {
    let sources = [
        ("package.json", read_version_from_json(&workspace.join("package.json"))),
        ("src-tauri/tauri.conf.json", read_version_from_json(&workspace.join("src-tauri").join("tauri.conf.json"))),
        ("src-tauri/Cargo.toml", read_version_from_cargo_toml(&workspace.join("src-tauri").join("Cargo.toml"))),
    ];
    let mut resolved = Vec::new();
    for (name, version) in sources {
        let value = version.ok_or_else(|| format!("Release version is missing from {name}."))?;
        resolved.push((name, value));
    }
    let authoritative = resolved[0].1.clone();
    let mismatches: Vec<String> = resolved.iter()
        .filter(|(_, version)| version != &authoritative)
        .map(|(name, version)| format!("{name}={version}"))
        .collect();
    if !mismatches.is_empty() {
        return Err(format!(
            "Release version mismatch. package.json={} but {}. Align all version sources before packaging.",
            authoritative,
            mismatches.join(", ")
        ));
    }
    Ok(authoritative)
}

fn workspace_version(workspace: &Path) -> String {
    read_version_from_json(&workspace.join("package.json"))
        .or_else(|| read_version_from_json(&workspace.join("src-tauri").join("tauri.conf.json")))
        .unwrap_or_else(|| "0.0.0".to_string())
}

fn release_artifact_ext(path: &Path) -> bool {
    let Some(ext) = path.extension().map(|value| value.to_string_lossy().to_lowercase()) else {
        return false;
    };

    matches!(ext.as_str(), "exe" | "msi" | "zip" | "msix" | "appx" | "dmg" | "deb" | "rpm")
}

fn collect_bundle_artifacts(current: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if !current.exists() {
        return Ok(());
    }

    let read_dir = fs::read_dir(current).map_err(|error| format!("Unable to read bundle folder: {error}"))?;
    for item in read_dir.flatten() {
        let path = item.path();
        let Ok(metadata) = item.metadata() else {
            continue;
        };

        if metadata.is_dir() {
            collect_bundle_artifacts(&path, files)?;
        } else if metadata.is_file() && release_artifact_ext(&path) {
            files.push(path);
        }
    }

    files.sort_by_key(|path| path.to_string_lossy().to_lowercase());
    Ok(())
}

fn calculate_file_sha256(path: &Path) -> Result<String, String> {
    let mut handle = fs::File::open(path).map_err(|error| format!("Unable to open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let read = handle.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn unique_destination_path(destination_dir: &Path, file_name: &str) -> PathBuf {
    let mut candidate = destination_dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let source_path = Path::new(file_name);
    let stem = source_path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "artifact".to_string());
    let extension = source_path.extension().map(|value| value.to_string_lossy().to_string());

    for index in 2..1000 {
        let name = match &extension {
            Some(ext) if !ext.is_empty() => format!("{stem}_{index}.{ext}"),
            _ => format!("{stem}_{index}"),
        };
        candidate = destination_dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }

    destination_dir.join(format!("artifact_{}.bin", now_unix_seconds()))
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn ps_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[tauri::command]
fn get_release_info(workspace_path: String) -> Result<ReleaseInfo, String> {
    let workspace = normalize_path(&workspace_path)?;
    ensure_directory(&workspace)?;

    let package_json = workspace.join("package.json");
    let tauri_config = workspace.join("src-tauri").join("tauri.conf.json");
    let bundle_directory = workspace.join("src-tauri").join("target").join("release").join("bundle");
    let release_root = workspace.join("releases");

    let mut artifacts = Vec::new();
    collect_bundle_artifacts(&bundle_directory, &mut artifacts)?;

    let mut warnings = Vec::new();
    if !package_json.is_file() {
        warnings.push("package.json was not found in the workspace root. npm build will not run from this folder.".to_string());
    }
    if !tauri_config.is_file() {
        warnings.push("src-tauri\\tauri.conf.json was not found. Tauri build/package commands need a Tauri project folder.".to_string());
    }
    if artifacts.is_empty() {
        warnings.push("No release artifacts were found yet. Run npm build and Tauri build before creating the final release package.".to_string());
    }

    Ok(ReleaseInfo {
        workspace_path: workspace.to_string_lossy().to_string(),
        app_version: workspace_version(&workspace),
        has_package_json: package_json.is_file(),
        has_tauri_config: tauri_config.is_file(),
        has_bundle_artifacts: !artifacts.is_empty(),
        bundle_directory: bundle_directory.to_string_lossy().to_string(),
        release_root: release_root.to_string_lossy().to_string(),
        artifact_count: artifacts.len(),
        warnings,
    })
}

#[tauri::command]
fn create_release_package(workspace_path: String, release_notes: String) -> Result<ReleasePackageResult, String> {
    let workspace = normalize_path(&workspace_path)?;
    ensure_directory(&workspace)?;

    let version = validated_release_version(&workspace)?;
    let bundle_directory = workspace.join("src-tauri").join("target").join("release").join("bundle");
    let mut artifacts = Vec::new();
    collect_bundle_artifacts(&bundle_directory, &mut artifacts)?;

    if artifacts.is_empty() {
        return Err("Release package was not created because no installer artifacts were found under src-tauri\\target\\release\\bundle. Run Tauri Build first.".to_string());
    }
    let incorrectly_versioned: Vec<String> = artifacts.iter().filter_map(|path| {
        let name = path.file_name()?.to_string_lossy().to_string();
        if name.contains(&version) { None } else { Some(name) }
    }).collect();
    if !incorrectly_versioned.is_empty() {
        return Err(format!(
            "Release package was not created because installer filenames do not contain authoritative version {}: {}",
            version,
            incorrectly_versioned.join(", ")
        ));
    }

    let release_root = workspace.join("releases");
    fs::create_dir_all(&release_root).map_err(|error| format!("Unable to create releases folder: {error}"))?;
    let release_directory = release_root.join(format!("DiligentCodeStudio_v{}_{}", version, now_unix_seconds()));
    fs::create_dir_all(&release_directory).map_err(|error| format!("Unable to create release folder: {error}"))?;

    let mut copied_files = Vec::new();
    let mut messages = Vec::new();

    for artifact in artifacts {
        let file_name = artifact
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "artifact.bin".to_string());
        let destination = unique_destination_path(&release_directory, &file_name);
        fs::copy(&artifact, &destination).map_err(|error| {
            format!("Unable to copy {} to {}: {error}", artifact.display(), destination.display())
        })?;
        copied_files.push(destination.to_string_lossy().to_string());
    }

    let notes_file = release_directory.join("RELEASE_NOTES.md");
    let notes = if release_notes.trim().is_empty() {
        format!(
            "# Diligent Code Studio v{}\n\n## Release Notes\n\n- Built with Diligent Code Studio Release Builder.\n- SHA-256 checksums are included in SHA256SUMS.txt.\n",
            version
        )
    } else {
        release_notes
    };
    fs::write(&notes_file, notes).map_err(|error| format!("Unable to write release notes: {error}"))?;

    let checksum_file = release_directory.join("SHA256SUMS.txt");
    let mut checksum_lines = Vec::new();
    for copied in &copied_files {
        let path = PathBuf::from(copied);
        let hash = calculate_file_sha256(&path)?;
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        checksum_lines.push(format!("{}  {}", hash, name));
    }

    fs::write(&checksum_file, format!("{}\n", checksum_lines.join("\n")))
        .map_err(|error| format!("Unable to write checksum file: {error}"))?;

    let zip_path = release_root.join(format!("DiligentCodeStudio_v{}_{}.zip", version, now_unix_seconds()));

    #[cfg(target_os = "windows")]
    {
        let source = format!("{}\\*", release_directory.to_string_lossy());
        let command_text = format!(
            "Compress-Archive -Path {} -DestinationPath {} -Force",
            ps_single_quote(&source),
            ps_single_quote(&zip_path.to_string_lossy())
        );
        let output = hidden_command("powershell.exe")
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(command_text)
            .output()
            .map_err(|error| format!("Unable to create ZIP package with PowerShell: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(format!("ZIP creation failed: {}", stderr.trim()));
        }
        messages.push(format!("Created ZIP package: {}", zip_path.display()));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let release_name = release_directory
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "release".to_string());
        let zip_name = zip_path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "DiligentCodeStudio_release.zip".to_string());

        let output = hidden_command("zip")
            .arg("-r")
            .arg(&zip_name)
            .arg(&release_name)
            .current_dir(&release_root)
            .output();

        match output {
            Ok(value) if value.status.success() => messages.push(format!("Created ZIP package: {}", zip_path.display())),
            Ok(value) => {
                let stderr = String::from_utf8_lossy(&value.stderr).to_string();
                return Err(format!("ZIP creation failed: {}", stderr.trim()));
            }
            Err(error) => return Err(format!("ZIP creation failed because the zip command is unavailable: {error}")),
        }
    }

    if !zip_path.is_file() {
        return Err(format!("ZIP creation reported success but output was not found: {}", zip_path.display()));
    }

    messages.push(format!("Release folder: {}", release_directory.display()));
    messages.push(format!("Checksum file: {}", checksum_file.display()));
    messages.push(format!("Release notes: {}", notes_file.display()));

    Ok(ReleasePackageResult {
        release_directory: release_directory.to_string_lossy().to_string(),
        zip_path: zip_path.to_string_lossy().to_string(),
        checksum_file: checksum_file.to_string_lossy().to_string(),
        notes_file: notes_file.to_string_lossy().to_string(),
        copied_files,
        messages,
    })
}

#[tauri::command]
fn open_release_folder(path: String) -> Result<(), String> {
    let folder = normalize_path(&path)?;
    ensure_directory(&folder)?;

    let command_name = open_folder_command_name();
    Command::new(command_name)
        .arg(folder.to_string_lossy().to_string())
        .spawn()
        .map_err(|error| format!("Unable to open folder with {command_name}: {error}"))?;
    Ok(())
}



fn strip_workspace_relative(workspace: &Path, path: &Path) -> String {
    path.strip_prefix(workspace)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn resolve_diagnostic_path(workspace: &Path, command_cwd: &Path, raw_path: &str) -> PathBuf {
    let cleaned = raw_path.trim().trim_matches('"');
    let candidate = PathBuf::from(cleaned);
    if candidate.is_absolute() {
        return candidate;
    }

    let cwd_joined = command_cwd.join(&candidate);
    if cwd_joined.exists() {
        return cwd_joined;
    }

    let workspace_joined = workspace.join(&candidate);
    if workspace_joined.exists() {
        return workspace_joined;
    }

    cwd_joined
}

fn parse_usize(value: &str) -> Option<usize> {
    value.trim().parse::<usize>().ok()
}

fn parse_path_line_column_colon(line: &str) -> Option<(String, usize, usize, String)> {
    let trimmed = line.trim();
    let message_start = trimmed
        .find(" - error")
        .or_else(|| trimmed.find(" - warning"))
        .or_else(|| trimmed.find(": error"))
        .or_else(|| trimmed.find(": warning"))?;

    let location = &trimmed[..message_start];
    let message = trimmed[message_start..].trim_start_matches(':').trim_start_matches('-').trim().to_string();
    let mut pieces = location.rsplitn(3, ':');
    let column_text = pieces.next()?;
    let line_text = pieces.next()?;
    let path_text = pieces.next()?;

    let line_number = parse_usize(line_text)?;
    let column = parse_usize(column_text)?;
    let path = path_text.trim().to_string();
    if path.is_empty() {
        return None;
    }

    Some((path, line_number, column, message))
}

fn parse_path_line_column_paren(line: &str) -> Option<(String, usize, usize, String)> {
    let trimmed = line.trim();
    let close = trimmed.find("): ")?;
    let before = &trimmed[..close];
    let open = before.rfind('(')?;
    let path = before[..open].trim().to_string();
    let location = &before[open + 1..];
    let mut parts = location.split(',');
    let line_number = parse_usize(parts.next()?)?;
    let column = parse_usize(parts.next()?)?;
    let message = trimmed[close + 3..].trim().to_string();

    if path.is_empty() {
        return None;
    }

    Some((path, line_number, column, message))
}

fn parse_rust_arrow_line(line: &str) -> Option<(String, usize, usize)> {
    let arrow = line.find("-->")?;
    let rest = line[arrow + 3..].trim();
    let mut pieces = rest.rsplitn(3, ':');
    let column_text = pieces.next()?;
    let line_text = pieces.next()?;
    let path_text = pieces.next()?;
    let line_number = parse_usize(line_text)?;
    let column = parse_usize(column_text)?;
    let path = path_text.trim().to_string();

    if path.is_empty() {
        return None;
    }

    Some((path, line_number, column))
}

fn problem_from_location(
    workspace: &Path,
    command_cwd: &Path,
    command: &str,
    source: &str,
    severity: &str,
    raw_path: &str,
    line_number: usize,
    column: usize,
    message: &str,
) -> DiagnosticProblem {
    let absolute = resolve_diagnostic_path(workspace, command_cwd, raw_path);
    DiagnosticProblem {
        severity: severity.to_string(),
        source: source.to_string(),
        message: message.trim().to_string(),
        file_path: absolute.to_string_lossy().to_string(),
        relative_path: strip_workspace_relative(workspace, &absolute),
        line_number,
        column,
        command: command.to_string(),
    }
}

fn parse_diagnostic_output(
    workspace: &Path,
    command_cwd: &Path,
    command: &str,
    source: &str,
    output: &str,
) -> Vec<DiagnosticProblem> {
    let mut problems = Vec::new();
    let mut last_rust_message = String::new();
    let mut last_rust_severity = "error".to_string();

    for line in output.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();

        if lower.starts_with("error") || lower.starts_with("warning") {
            last_rust_message = trimmed.to_string();
            last_rust_severity = if lower.starts_with("warning") { "warning".to_string() } else { "error".to_string() };
        }

        if let Some((path, line_number, column, message)) = parse_path_line_column_paren(trimmed)
            .or_else(|| parse_path_line_column_colon(trimmed))
        {
            let severity = if message.to_lowercase().contains("warning") { "warning" } else { "error" };
            problems.push(problem_from_location(
                workspace,
                command_cwd,
                command,
                source,
                severity,
                &path,
                line_number,
                column,
                if message.is_empty() { trimmed } else { &message },
            ));
            continue;
        }

        if let Some((path, line_number, column)) = parse_rust_arrow_line(trimmed) {
            let message = if last_rust_message.trim().is_empty() {
                "Rust diagnostic".to_string()
            } else {
                last_rust_message.clone()
            };
            problems.push(problem_from_location(
                workspace,
                command_cwd,
                command,
                source,
                &last_rust_severity,
                &path,
                line_number,
                column,
                &message,
            ));
        }
    }

    problems
}

fn diagnostic_command(cwd: &Path, command_text: &str, shell: Option<String>) -> Result<TerminalResult, String> {
    run_terminal_command(
        cwd.to_string_lossy().to_string(),
        command_text.to_string(),
        shell,
    )
}

#[tauri::command]
fn run_diagnostics(workspace_path: String, shell: Option<String>) -> Result<DiagnosticRunResult, String> {
    let workspace = normalize_path(&workspace_path)?;
    ensure_directory(&workspace)?;

    let mut commands: Vec<(PathBuf, String, String)> = Vec::new();
    let package_json = workspace.join("package.json");
    let tauri_cargo = workspace.join("src-tauri").join("Cargo.toml");
    let root_cargo = workspace.join("Cargo.toml");

    if package_json.is_file() {
        commands.push((workspace.clone(), format!("{} run build", npm_executable()), "TypeScript/Vite".to_string()));
    }

    if tauri_cargo.is_file() {
        commands.push((workspace.join("src-tauri"), "cargo check".to_string(), "Rust/Cargo".to_string()));
    } else if root_cargo.is_file() {
        commands.push((workspace.clone(), "cargo check".to_string(), "Rust/Cargo".to_string()));
    }

    if commands.is_empty() {
        return Ok(DiagnosticRunResult {
            workspace_path: workspace.to_string_lossy().to_string(),
            commands_run: Vec::new(),
            exit_code: 0,
            problem_count: 0,
            error_count: 0,
            warning_count: 0,
            problems: Vec::new(),
            output: "No supported diagnostic commands were detected. Choose a project folder with package.json, Cargo.toml, or src-tauri\\Cargo.toml.\n".to_string(),
            messages: vec!["No supported diagnostic commands were detected for this workspace.".to_string()],
        });
    }

    let mut combined_output = String::new();
    let mut problems = Vec::new();
    let mut commands_run = Vec::new();
    let mut final_exit_code = 0;

    for (cwd, command_text, source) in commands {
        commands_run.push(format!("{} :: {}", cwd.display(), command_text));
        combined_output.push_str(&format!("\n=== {} ===\nDCS {}> {}\n", source, cwd.display(), command_text));

        match diagnostic_command(&cwd, &command_text, shell.clone()) {
            Ok(result) => {
                final_exit_code = if result.exit_code != 0 { result.exit_code } else { final_exit_code };
                let command_output = format!("{}\n{}\nExit Code: {}\n", result.stdout, result.stderr, result.exit_code);
                combined_output.push_str(&command_output);
                problems.extend(parse_diagnostic_output(&workspace, &cwd, &command_text, &source, &command_output));
            }
            Err(error) => {
                final_exit_code = 1;
                combined_output.push_str(&format!("ERROR: {}\n", error));
                problems.push(DiagnosticProblem {
                    severity: "error".to_string(),
                    source,
                    message: error,
                    file_path: String::new(),
                    relative_path: "Command".to_string(),
                    line_number: 0,
                    column: 0,
                    command: command_text,
                });
            }
        }
    }

    let error_count = problems.iter().filter(|problem| problem.severity == "error").count();
    let warning_count = problems.iter().filter(|problem| problem.severity == "warning").count();
    let problem_count = problems.len();
    let messages = if problem_count == 0 && final_exit_code == 0 {
        vec!["Diagnostics completed without detected problems.".to_string()]
    } else if problem_count == 0 {
        vec!["Diagnostics found a failing command, but no file/line diagnostics could be parsed from the output.".to_string()]
    } else {
        vec![format!("Diagnostics found {} problem(s): {} error(s), {} warning(s).", problem_count, error_count, warning_count)]
    };

    Ok(DiagnosticRunResult {
        workspace_path: workspace.to_string_lossy().to_string(),
        commands_run,
        exit_code: final_exit_code,
        problem_count,
        error_count,
        warning_count,
        problems,
        output: combined_output,
        messages,
    })
}


fn write_project_file(base: &Path, relative: &str, contents: &str, created: &mut Vec<String>) -> Result<(), String> {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create directory {}: {}", parent.display(), error))?;
    }
    fs::write(&path, contents).map_err(|error| format!("Could not write file {}: {}", path.display(), error))?;
    created.push(relative.to_string());
    Ok(())
}

fn project_templates() -> Vec<ProjectTemplate> {
    vec![
        ProjectTemplate {
            id: "blank".to_string(),
            name: "Blank Project".to_string(),
            description: "Minimal starter with README, LICENSE, CHANGELOG, and .gitignore.".to_string(),
            files: vec!["README.md", "CHANGELOG.md", "LICENSE", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "powershell_tool".to_string(),
            name: "PowerShell Tool".to_string(),
            description: "Starter layout for Windows admin tools with scripts, docs, logs, and release folder.".to_string(),
            files: vec!["Scripts/Main.ps1", "Scripts/Modules/.gitkeep", "Logs/.gitkeep", "releases/.gitkeep", "README.md", "CHANGELOG.md", "LICENSE", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "csharp_app".to_string(),
            name: "C# Console App".to_string(),
            description: "Simple .NET-style C# console starter with project file and Program.cs.".to_string(),
            files: vec!["src/Program.cs", "src/App.csproj", "README.md", "CHANGELOG.md", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "tauri_app".to_string(),
            name: "Tauri App".to_string(),
            description: "Small React + Tauri starter layout for desktop applications.".to_string(),
            files: vec!["package.json", "index.html", "src/main.tsx", "src/App.tsx", "src/styles.css", "src-tauri/Cargo.toml", "src-tauri/build.rs", "src-tauri/src/main.rs", "src-tauri/tauri.conf.json", "README.md", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "web_project".to_string(),
            name: "Static Website".to_string(),
            description: "Static HTML/CSS/JavaScript site starter for local preview and static hosting.".to_string(),
            files: vec!["index.html", "src/styles.css", "src/app.js", "assets/.gitkeep", "README.md", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "react_vite_site".to_string(),
            name: "React + Vite Website".to_string(),
            description: "Modern React/Vite/TypeScript website starter with local preview, build, and deployment scripts.".to_string(),
            files: vec!["package.json", "index.html", "src/main.tsx", "src/App.tsx", "src/styles.css", "public/.gitkeep", "README.md", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "diligent_release_package".to_string(),
            name: "Diligent Release Package".to_string(),
            description: "Release-ready folder with notes, checksums, installer/output directories, and build script placeholder.".to_string(),
            files: vec!["release-input/.gitkeep", "release-output/.gitkeep", "scripts/Build-Release.ps1", "RELEASE_NOTES.md", "SHA256SUMS.txt", "README.md", ".gitignore"].into_iter().map(String::from).collect(),
        },
        ProjectTemplate {
            id: "docs_license".to_string(),
            name: "README + LICENSE Starter".to_string(),
            description: "Documentation-first starter for open-source packages, support files, and notices.".to_string(),
            files: vec!["README.md", "LICENSE", "NOTICE", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", ".gitignore"].into_iter().map(String::from).collect(),
        },
    ]
}

fn apache_license_text(project_name: &str) -> String {
    format!("Apache License\nVersion 2.0, January 2004\n\nCopyright 2026 Diligent Software Services\n\nLicensed under the Apache License, Version 2.0. See the Apache 2.0 license text for details.\n\nProject: {}\n", project_name)
}

fn gitignore_text() -> &'static str {
    "node_modules/\ndist/\nbuild/\ntarget/\nbin/\nobj/\n.vs/\n.idea/\n*.user\n*.suo\n*.log\n.env\nreleases/*.zip\nrelease-output/\n"
}

#[tauri::command]
fn get_project_templates() -> Vec<ProjectTemplate> {
    project_templates()
}

#[tauri::command]
fn create_project_from_template(parent_path: String, project_name: String, template_id: String) -> Result<ProjectTemplateResult, String> {
    let parent = normalize_path(&parent_path)?;
    ensure_directory(&parent)?;
    let safe_name = validate_child_name(&project_name)?;
    let project_path = parent.join(&safe_name);

    if project_path.exists() {
        return Err(format!("Project folder already exists: {}", project_path.display()));
    }

    fs::create_dir_all(&project_path).map_err(|error| format!("Could not create project directory: {}", error))?;

    let templates = project_templates();
    let template = templates
        .into_iter()
        .find(|item| item.id == template_id)
        .ok_or_else(|| format!("Unknown project template: {}", template_id))?;

    let mut created = Vec::new();
    let title = safe_name.replace('_', " ").replace('-', " ");

    match template.id.as_str() {
        "blank" => {
            write_project_file(&project_path, "README.md", &format!("# {}\n\nA new Diligent Code Studio project.\n\n## Getting Started\n\nDescribe the project purpose, setup steps, and release process here.\n", title), &mut created)?;
            write_project_file(&project_path, "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n- Initial project scaffold.\n", &mut created)?;
            write_project_file(&project_path, "LICENSE", &apache_license_text(&safe_name), &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "powershell_tool" => {
            write_project_file(&project_path, "Scripts/Main.ps1", &format!("<#\n.SYNOPSIS\n    {} starter script.\n#>\n\n[CmdletBinding()]\nparam()\n\nSet-StrictMode -Version Latest\n$ErrorActionPreference = 'Stop'\n\nWrite-Host '{} is ready.'\n", title, title), &mut created)?;
            write_project_file(&project_path, "Scripts/Modules/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "Logs/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "releases/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "README.md", &format!("# {}\n\nPowerShell tool starter created by Diligent Code Studio.\n\n## Run\n\n```powershell\nPowerShell -ExecutionPolicy Bypass -File .\\Scripts\\Main.ps1\n```\n", title), &mut created)?;
            write_project_file(&project_path, "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n- Initial PowerShell tool scaffold.\n", &mut created)?;
            write_project_file(&project_path, "LICENSE", &apache_license_text(&safe_name), &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "csharp_app" => {
            write_project_file(&project_path, "src/Program.cs", &format!("using System;\n\nConsole.WriteLine(\"{} is ready.\");\n", title), &mut created)?;
            write_project_file(&project_path, "src/App.csproj", &format!("<Project Sdk=\"Microsoft.NET.Sdk\">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n    <ImplicitUsings>enable</ImplicitUsings>\n    <Nullable>enable</Nullable>\n    <AssemblyName>{}</AssemblyName>\n  </PropertyGroup>\n</Project>\n", safe_name), &mut created)?;
            write_project_file(&project_path, "README.md", &format!("# {}\n\nC# console app starter.\n\n## Build\n\n```powershell\ndotnet build .\\src\\App.csproj\n```\n", title), &mut created)?;
            write_project_file(&project_path, "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n- Initial C# starter.\n", &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "tauri_app" => {
            write_project_file(&project_path, "package.json", &format!(r#"{{
  "name": "{}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {{
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }},
  "dependencies": {{
    "@tauri-apps/api": "latest",
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest"
  }},
  "devDependencies": {{}}
}}
"#, safe_name.to_lowercase()), &mut created)?;
            write_project_file(&project_path, "index.html", "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>\n", &mut created)?;
            write_project_file(&project_path, "src/main.tsx", "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n", &mut created)?;
            write_project_file(&project_path, "src/App.tsx", &format!("export default function App() {{\n  return <main className=\"app\"><h1>{}</h1><p>Tauri starter created by Diligent Code Studio.</p></main>;\n}}\n", title), &mut created)?;
            write_project_file(&project_path, "src/styles.css", "body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #e5e7eb; } .app { padding: 32px; }\n", &mut created)?;
            write_project_file(&project_path, "src-tauri/Cargo.toml", &format!("[package]\nname = \"{}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[build-dependencies]\ntauri-build = {{ version = \"2\", features = [] }}\n\n[dependencies]\ntauri = {{ version = \"2\", features = [] }}\n", safe_name.to_lowercase().replace('_', "-")), &mut created)?;
            write_project_file(&project_path, "src-tauri/build.rs", "fn main() { tauri_build::build() }\n", &mut created)?;
            write_project_file(&project_path, "src-tauri/src/main.rs", "fn main() {\n    tauri::Builder::default()\n        .run(tauri::generate_context!())\n        .expect(\"error while running tauri application\");\n}\n", &mut created)?;
            write_project_file(&project_path, "src-tauri/tauri.conf.json", &format!(r#"{{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "{}",
  "version": "0.1.0",
  "identifier": "com.diligentsoftwareservices.{}",
  "build": {{
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://127.0.0.1:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  }},
  "app": {{
    "windows": [{{ "title": "{}", "width": 1100, "height": 720 }}]
  }}
}}
"#, title, safe_name.to_lowercase().replace('_', "").replace('-', ""), title), &mut created)?;
            write_project_file(&project_path, "README.md", &format!("# {}\n\nReact + Tauri starter created by Diligent Code Studio.\n\n## Run\n\n```powershell\nnpm install\nnpm run tauri:dev\n```\n", title), &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "web_project" => {
            write_project_file(&project_path, "index.html", &format!(r##"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="{} website created with Diligent Code Studio" />
  <title>{}</title>
  <link rel="stylesheet" href="src/styles.css" />
</head>
<body>
  <header class="hero">
    <p class="eyebrow">Diligent Code Studio Website Starter</p>
    <h1>{}</h1>
    <p>Build locally, preview on your network, and publish globally when ready.</p>
    <a class="button" href="#content">Explore the site</a>
  </header>
  <main id="content" class="site-grid">
    <section><h2>Local Preview</h2><p>Use Web Builder to run a local or LAN preview server.</p></section>
    <section><h2>Global Hosting</h2><p>Deploy static files to GitHub Pages, Netlify, Vercel, or your own web host.</p></section>
    <section><h2>Next Steps</h2><p>Customize content, images, navigation, SEO metadata, and deployment settings.</p></section>
  </main>
  <script src="src/app.js"></script>
</body>
</html>
"##, title, title, title), &mut created)?;
            write_project_file(&project_path, "src/styles.css", "* { box-sizing: border-box; } body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #e5e7eb; } .hero { min-height: 52vh; display: grid; place-content: center; gap: 16px; padding: 56px 24px; text-align: center; background: radial-gradient(circle at top, #1e3a8a, transparent 55%), #020617; } .hero h1 { margin: 0; font-size: clamp(2.4rem, 7vw, 5rem); } .eyebrow { color: #38bdf8; text-transform: uppercase; letter-spacing: .16em; font-weight: 700; } .button { justify-self: center; padding: 12px 18px; border-radius: 999px; background: #2563eb; color: white; text-decoration: none; font-weight: 700; } .site-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; padding: 32px; } section { border: 1px solid rgba(148,163,184,.24); background: rgba(15,23,42,.72); border-radius: 18px; padding: 22px; }\n", &mut created)?;
            write_project_file(&project_path, "src/app.js", "console.log('Static website starter ready.');\n", &mut created)?;
            write_project_file(&project_path, "assets/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "README.md", &format!("# {}\n\nStatic website starter created by Diligent Code Studio.\n\n## Local Preview\n\nUse the Web Builder page to run a local preview or LAN preview. For simple static hosting, publish the project files or connect the repository to GitHub Pages, Netlify, Vercel, or your hosting provider.\n", title), &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "react_vite_site" => {
            write_project_file(&project_path, "package.json", &format!(r#"{{
  "name": "{}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {{
    "dev": "vite --host 127.0.0.1",
    "dev:lan": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1"
  }},
  "dependencies": {{
    "lucide-react": "latest",
    "react": "latest",
    "react-dom": "latest"
  }},
  "devDependencies": {{
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "typescript": "latest",
    "vite": "latest"
  }}
}}
"#, safe_name.to_lowercase()), &mut created)?;
            write_project_file(&project_path, "index.html", "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>\n", &mut created)?;
            write_project_file(&project_path, "vite.config.ts", "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n", &mut created)?;
            write_project_file(&project_path, "tsconfig.json", r#"{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}
"#, &mut created)?;
            write_project_file(&project_path, "src/main.tsx", "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n", &mut created)?;
            write_project_file(&project_path, "src/App.tsx", &format!(r#"import {{ Rocket, Globe2, Server }} from 'lucide-react';

const features = [
  ['Local preview', 'Run npm run dev for local development.'],
  ['LAN testing', 'Run npm run dev:lan to test from another device.'],
  ['Global deploy', 'Build with npm run build, then deploy dist/.'],
];

export default function App() {{
  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow"><Rocket size={{16}} /> Diligent Web Starter</p>
        <h1>{}</h1>
        <p>Modern React/Vite website ready for local preview, LAN testing, and global deployment.</p>
      </section>
      <section className="featureGrid">
        {{features.map(([title, text], index) => (
          <article key={{title}}>
            {{index === 0 ? <Server /> : <Globe2 />}}
            <h2>{{title}}</h2>
            <p>{{text}}</p>
          </article>
        ))}}
      </section>
    </main>
  );
}}
"#, title), &mut created)?;
            write_project_file(&project_path, "src/styles.css", "body { margin: 0; font-family: Inter, Segoe UI, Arial, sans-serif; background: #020617; color: #e5e7eb; } .app { min-height: 100vh; } .hero { padding: 72px 24px; text-align: center; background: radial-gradient(circle at top, rgba(37,99,235,.45), transparent 55%); } .eyebrow { display: inline-flex; align-items: center; gap: 8px; color: #38bdf8; font-weight: 800; text-transform: uppercase; letter-spacing: .14em; } h1 { font-size: clamp(2.5rem, 8vw, 5.75rem); margin: 12px 0; } .hero p:last-child { max-width: 720px; margin: 0 auto; color: #cbd5e1; font-size: 1.2rem; } .featureGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; padding: 32px; } article { border: 1px solid rgba(148,163,184,.22); border-radius: 22px; padding: 24px; background: rgba(15,23,42,.82); box-shadow: 0 22px 60px rgba(0,0,0,.28); } article svg { color: #38bdf8; } article p { color: #cbd5e1; }\n", &mut created)?;
            write_project_file(&project_path, "public/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "README.md", &format!("# {}\n\nReact + Vite website starter created by Diligent Code Studio.\n\n## Commands\n\n```powershell\nnpm install\nnpm run dev\nnpm run dev:lan\nnpm run build\nnpm run preview\n```\n\n## Deployment\n\nUse the Web Builder page to prepare Vercel, Netlify, GitHub Pages, or static-hosting deployment steps.\n", title), &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "diligent_release_package" => {
            write_project_file(&project_path, "release-input/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "release-output/.gitkeep", "", &mut created)?;
            write_project_file(&project_path, "scripts/Build-Release.ps1", "[CmdletBinding()]\nparam()\n\n$ErrorActionPreference = 'Stop'\nWrite-Host 'Build release package placeholder.'\n", &mut created)?;
            write_project_file(&project_path, "RELEASE_NOTES.md", &format!("# {} Release Notes\n\n## 0.1.0\n- Initial release package.\n", title), &mut created)?;
            write_project_file(&project_path, "SHA256SUMS.txt", "", &mut created)?;
            write_project_file(&project_path, "README.md", &format!("# {}\n\nDiligent release package starter.\n", title), &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        "docs_license" => {
            write_project_file(&project_path, "README.md", &format!("# {}\n\nProject overview, setup, usage, and support information.\n", title), &mut created)?;
            write_project_file(&project_path, "LICENSE", &apache_license_text(&safe_name), &mut created)?;
            write_project_file(&project_path, "NOTICE", &format!("{}\nCopyright 2026 Diligent Software Services.\n", title), &mut created)?;
            write_project_file(&project_path, "SECURITY.md", "# Security Policy\n\nReport security concerns privately to the project maintainer.\n", &mut created)?;
            write_project_file(&project_path, "CONTRIBUTING.md", "# Contributing\n\nOpen an issue before major changes and keep pull requests focused.\n", &mut created)?;
            write_project_file(&project_path, "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n- Initial documentation starter.\n", &mut created)?;
            write_project_file(&project_path, ".gitignore", gitignore_text(), &mut created)?;
        }
        _ => return Err(format!("Unsupported template: {}", template.id)),
    }

    Ok(ProjectTemplateResult {
        project_path: project_path.to_string_lossy().to_string(),
        template_id: template.id,
        template_name: template.name,
        created_files: created,
    })
}


#[derive(Debug, Deserialize)]
struct OpenAiResponseContent {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiOutputItem {
    #[serde(default)]
    content: Vec<OpenAiResponseContent>,
}

#[derive(Debug, Deserialize)]
struct OpenAiResponsesApiResponse {
    #[serde(default)]
    output_text: String,
    #[serde(default)]
    output: Vec<OpenAiOutputItem>,
}

#[derive(Debug, Deserialize)]
struct OllamaGenerateResponse {
    #[serde(default)]
    response: String,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaModelInfo>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct OllamaModelInfo {
    name: String,
    #[serde(default)]
    modified_at: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digest: String,
}


#[derive(Debug, Serialize)]
struct OllamaStatusInfo {
    installed: bool,
    version: String,
    running: bool,
    endpoint: String,
    model_count: usize,
    models: Vec<OllamaModelInfo>,
    message: String,
}

#[derive(Debug, Serialize)]
struct AiChatResponse {
    provider: String,
    model: String,
    response: String,
}

fn trim_ai_context(value: &str) -> String {
    const MAX_CONTEXT_CHARS: usize = 24000;
    if value.chars().count() <= MAX_CONTEXT_CHARS {
        return value.to_string();
    }

    let tail: String = value.chars().rev().take(MAX_CONTEXT_CHARS).collect::<Vec<char>>().into_iter().rev().collect();
    format!("[Context trimmed to the most recent {} characters.]\n\n{}", MAX_CONTEXT_CHARS, tail)
}

fn normalize_ollama_endpoint(endpoint: &str) -> String {
    let base = endpoint.trim().trim_end_matches('/');
    if base.is_empty() {
        "http://127.0.0.1:11434".to_string()
    } else if base.ends_with("/api") {
        base.trim_end_matches("/api").to_string()
    } else if base.ends_with("/api/generate") {
        base.trim_end_matches("/api/generate").to_string()
    } else if base.ends_with("/api/tags") {
        base.trim_end_matches("/api/tags").to_string()
    } else {
        base.to_string()
    }
}

#[tauri::command]
fn list_ollama_models(endpoint: String) -> Result<Vec<OllamaModelInfo>, String> {
    let base = normalize_ollama_endpoint(&endpoint);
    let url = format!("{}/api/tags", base);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Unable to initialize Ollama HTTP client: {}", error))?;

    let response = client
        .get(&url)
        .send()
        .map_err(|error| format!("Could not contact Ollama at {}. Install/start Ollama, then try Refresh Models. {}", url, error))?;

    let status = response.status();
    let text = response.text().map_err(|error| format!("Ollama model list response read failed: {}", error))?;
    if !status.is_success() {
        return Err(format!("Ollama returned HTTP {} from {}: {}", status, url, text));
    }

    let parsed: OllamaTagsResponse = serde_json::from_str(&text)
        .map_err(|error| format!("Ollama model list parse failed: {}\n{}", error, text))?;

    Ok(parsed.models)
}

fn ollama_version_status() -> (bool, String) {
    let mut candidates = vec!["ollama".to_string()];

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(format!(r"{}\Programs\Ollama\ollama.exe", local_app_data));
            candidates.push(format!(r"{}\Ollama\ollama.exe", local_app_data));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            candidates.push(format!(r"{}\Ollama\ollama.exe", program_files));
        }
    }

    candidates.sort();
    candidates.dedup();

    for command in candidates {
        let output = hidden_command(&command)
            .arg("--version")
            .output();

        if let Ok(value) = output {
            let stdout = String::from_utf8_lossy(&value.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&value.stderr).trim().to_string();
            let version_text = if !stdout.is_empty() { stdout } else { stderr };
            if value.status.success() || version_text.to_lowercase().contains("ollama") {
                return (true, version_text);
            }
        }
    }

    (false, String::new())
}

fn ollama_endpoint_candidates(endpoint: &str) -> Vec<String> {
    let base = normalize_ollama_endpoint(endpoint);
    let mut candidates = vec![base.clone()];

    if base.contains("127.0.0.1") {
        candidates.push(base.replace("127.0.0.1", "localhost"));
    } else if base.contains("localhost") {
        candidates.push(base.replace("localhost", "127.0.0.1"));
    } else if base.trim().is_empty() {
        candidates.push("http://localhost:11434".to_string());
    }

    candidates.sort();
    candidates.dedup();
    candidates
}

#[tauri::command]
fn get_ollama_status(endpoint: String) -> Result<OllamaStatusInfo, String> {
    let (cli_installed, cli_version) = ollama_version_status();
    let candidates = ollama_endpoint_candidates(&endpoint);
    let preferred_endpoint = candidates
        .first()
        .cloned()
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|error| format!("Unable to initialize Ollama status HTTP client: {}", error))?;

    let mut last_message = String::new();

    for base in &candidates {
        let url = format!("{}/api/tags", base);
        match client.get(&url).send() {
            Ok(response) => {
                let status = response.status();
                let text = response.text().unwrap_or_default();
                if !status.is_success() {
                    last_message = format!("Ollama responded at {} but returned HTTP {}. {}", url, status, text);
                    continue;
                }

                match serde_json::from_str::<OllamaTagsResponse>(&text) {
                    Ok(parsed) => {
                        let count = parsed.models.len();
                        let message = if count == 0 {
                            "Ollama is running, but no models are installed. Run: ollama pull llama3.2".to_string()
                        } else {
                            format!("Ollama is running. {} local model(s) detected.", count)
                        };
                        let version = if !cli_version.trim().is_empty() {
                            cli_version.clone()
                        } else {
                            "Local Ollama API is running. CLI was not found on PATH for this app session.".to_string()
                        };

                        return Ok(OllamaStatusInfo {
                            installed: true,
                            version,
                            running: true,
                            endpoint: base.clone(),
                            model_count: count,
                            models: parsed.models,
                            message,
                        });
                    }
                    Err(error) => {
                        last_message = format!("Ollama responded at {} but the model list could not be parsed: {}", url, error);
                    }
                }
            }
            Err(error) => {
                last_message = format!("Could not contact Ollama at {}. {}", url, error);
            }
        }
    }

    let installed = cli_installed;
    let version = cli_version;
    let message = if installed {
        format!("Ollama appears to be installed, but the local API is not responding. Checked {}. Start Ollama, then try Refresh Models. {}", candidates.join(", "), last_message)
    } else {
        format!("Ollama was not found on PATH and the local API is not responding. Checked {}. If Ollama is open, try endpoint http://localhost:11434 or restart Diligent Code Studio. {}", candidates.join(", "), last_message)
    };

    Ok(OllamaStatusInfo {
        installed,
        version,
        running: false,
        endpoint: preferred_endpoint,
        model_count: 0,
        models: Vec::new(),
        message,
    })
}

#[tauri::command]
fn ai_chat(
    provider: String,
    api_key: String,
    model: String,
    endpoint: String,
    prompt: String,
    context: String,
) -> Result<AiChatResponse, String> {
    let provider_clean = provider.trim().to_lowercase();
    let model_clean = if model.trim().is_empty() {
        if provider_clean == "ollama" { "codellama".to_string() } else { "gpt-4.1-mini".to_string() }
    } else {
        model.trim().to_string()
    };

    let context_clean = trim_ai_context(&context);
    let system_prompt = "You are the optional Diligent Code Studio AI Coding Assistant. Help with coding, debugging, refactoring, documentation, build errors, and release notes. Be practical, security-aware, and never claim to have changed files unless the user explicitly applies changes.";
    let user_prompt = format!(
        "User request:\n{}\n\nContext from Diligent Code Studio:\n{}",
        prompt.trim(),
        context_clean
    );

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| format!("Unable to initialize AI HTTP client: {}", error))?;

    match provider_clean.as_str() {
        "openai" => {
            let key = api_key.trim();
            if key.is_empty() {
                return Err("OpenAI API key is required.".to_string());
            }

            let body = serde_json::json!({
                "model": model_clean,
                "input": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": user_prompt }
                ]
            });

            let response = client
                .post("https://api.openai.com/v1/responses")
                .bearer_auth(key)
                .json(&body)
                .send()
                .map_err(|error| format!("OpenAI request failed: {}", error))?;

            let status = response.status();
            let text = response.text().map_err(|error| format!("OpenAI response read failed: {}", error))?;
            if !status.is_success() {
                return Err(format!("OpenAI returned HTTP {}: {}", status, text));
            }

            let parsed: OpenAiResponsesApiResponse = serde_json::from_str(&text)
                .map_err(|error| format!("OpenAI response parse failed: {}\n{}", error, text))?;
            let mut output = parsed.output_text.trim().to_string();
            if output.is_empty() {
                output = parsed
                    .output
                    .iter()
                    .flat_map(|item| item.content.iter())
                    .map(|content| content.text.trim())
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<&str>>()
                    .join("\n");
            }
            if output.is_empty() {
                output = "OpenAI returned an empty response.".to_string();
            }

            Ok(AiChatResponse { provider: "OpenAI".to_string(), model: model_clean, response: output })
        }
        "ollama" => {
            let base = normalize_ollama_endpoint(&endpoint);
            let url = format!("{}/api/generate", base);
            let body = serde_json::json!({
                "model": model_clean,
                "prompt": format!("{}\n\n{}", system_prompt, user_prompt),
                "stream": false
            });

            let response = client
                .post(&url)
                .json(&body)
                .send()
                .map_err(|error| format!("Ollama request failed. Is Ollama running at {}? {}", url, error))?;

            let status = response.status();
            let text = response.text().map_err(|error| format!("Ollama response read failed: {}", error))?;
            if !status.is_success() {
                return Err(format!("Ollama returned HTTP {}: {}", status, text));
            }

            let parsed: OllamaGenerateResponse = serde_json::from_str(&text)
                .map_err(|error| format!("Ollama response parse failed: {}\n{}", error, text))?;
            let output = if parsed.response.trim().is_empty() {
                "Ollama returned an empty response.".to_string()
            } else {
                parsed.response
            };

            Ok(AiChatResponse { provider: "Ollama".to_string(), model: model_clean, response: output })
        }
        _ => Err("AI provider is disabled or unsupported. Choose OpenAI or Ollama in Settings.".to_string()),
    }
}

#[tauri::command]
fn calculate_sha256(path: String) -> Result<String, String> {
    let file = normalize_path(&path)?;
    ensure_file(&file)?;

    let mut handle = fs::File::open(&file).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let read = handle.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn run_app() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pick_workspace_folder, list_workspace, list_directory, read_text_file, write_text_file, save_text_file_as, create_text_file, create_folder, rename_path, delete_path, run_terminal_command, open_powershell_window, calculate_sha256, detect_project, check_development_tools, check_setup_dependencies, install_setup_dependency, open_external_url, get_platform_info, search_workspace, git_init, git_status, git_stage_all, git_stage_file, git_unstage_file, git_commit, git_create_tag, get_release_info, create_release_package, open_release_folder, run_diagnostics, get_project_templates, create_project_from_template, list_ollama_models, get_ollama_status, ai_chat, dcs_read_text_file, dcs_write_text_file])
        .run(tauri::generate_context!())
}



#[cfg(test)]
mod tests {
    use super::*;

    fn durability_test_directory(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should follow the Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "diligent-code-studio-{name}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).expect("test directory should be created");
        directory
    }

    #[test]
    fn child_name_validation_blocks_path_traversal() {
        assert!(validate_child_name("safe-file.txt").is_ok());
        assert!(validate_child_name("../secret.txt").is_err());
        assert!(validate_child_name("bad:name.txt").is_err());
        assert!(validate_child_name(" ").is_err());
    }

    #[test]
    fn terminal_command_validation_blocks_empty_and_control_chars() {
        assert_eq!(validate_terminal_command(" git status ").unwrap(), "git status");
        assert!(validate_terminal_command("").is_err());
        assert!(validate_terminal_command("npm run build\nwhoami").is_err());
        assert!(validate_terminal_command("bad\0command").is_err());
    }

    #[test]
    fn skip_directory_defaults_include_large_or_generated_folders() {
        assert!(should_skip_directory("node_modules"));
        assert!(should_skip_directory("target"));
        assert!(should_skip_directory("dist"));
        assert!(!should_skip_directory("src"));
    }

    #[test]
    fn command_normalization_handles_npm_for_platform() {
        let normalized = normalize_command_for_platform("npm run build");
        #[cfg(target_os = "windows")]
        assert!(normalized.starts_with("npm.cmd "));
        #[cfg(not(target_os = "windows"))]
        assert!(normalized.starts_with("npm "));
    }

    #[test]
    fn atomic_text_save_replaces_content_and_keeps_last_known_good_copy() {
        let directory = durability_test_directory("atomic-save");
        let file = directory.join("source.txt");
        fs::write(&file, "previous content").expect("initial source should be written");

        write_text_file_safely(&file, "current content".to_string())
            .expect("atomic save should succeed");

        assert_eq!(fs::read_to_string(&file).unwrap(), "current content");
        assert_eq!(
            fs::read_to_string(recovery_path(&file).unwrap()).unwrap(),
            "previous content"
        );
        assert!(!fs::read_dir(&directory).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")
        }));
        fs::remove_dir_all(directory).expect("test directory should be removed");
    }

    #[test]
    fn text_read_restores_valid_recovery_copy_after_primary_corruption() {
        let directory = durability_test_directory("recovery");
        let file = directory.join("source.txt");
        fs::write(&file, [0xff, 0xfe]).expect("corrupt primary should be written");
        fs::write(recovery_path(&file).unwrap(), "recovered content")
            .expect("recovery copy should be written");

        let recovered = read_text_file_with_recovery(&file).expect("recovery should succeed");

        assert_eq!(recovered, "recovered content");
        assert_eq!(fs::read_to_string(&file).unwrap(), "recovered content");
        fs::remove_dir_all(directory).expect("test directory should be removed");
    }

    #[test]
    fn atomic_text_save_handles_large_utf8_content() {
        let directory = durability_test_directory("large-save");
        let file = directory.join("large.txt");
        let contents = "Diligent ☕\n".repeat(350_000);

        write_text_file_safely(&file, contents.clone()).expect("large atomic save should succeed");

        assert_eq!(fs::read_to_string(&file).unwrap(), contents);
        fs::remove_dir_all(directory).expect("test directory should be removed");
    }

    #[test]
    fn atomic_text_save_rejects_missing_parent_without_creating_output() {
        let directory = durability_test_directory("missing-parent");
        let file = directory.join("missing").join("source.txt");

        let error = write_text_file_safely(&file, "content".to_string()).unwrap_err();

        assert!(error.contains("Parent directory does not exist"));
        assert!(!file.exists());
        fs::remove_dir_all(directory).expect("test directory should be removed");
    }

    #[test]
    fn release_version_gate_requires_package_tauri_and_cargo_versions_to_match() {
        let directory = durability_test_directory("release-version");
        fs::create_dir_all(directory.join("src-tauri")).unwrap();
        fs::write(directory.join("package.json"), r#"{"version":"0.9.0"}"#).unwrap();
        fs::write(directory.join("src-tauri").join("tauri.conf.json"), r#"{"version":"0.9.0"}"#).unwrap();
        fs::write(directory.join("src-tauri").join("Cargo.toml"), "[package]\nname = \"fixture\"\nversion = \"0.9.0\"\n").unwrap();
        assert_eq!(validated_release_version(&directory).unwrap(), "0.9.0");

        fs::write(directory.join("src-tauri").join("tauri.conf.json"), r#"{"version":"0.8.0"}"#).unwrap();
        assert!(validated_release_version(&directory).unwrap_err().contains("version mismatch"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn release_builder_fails_before_creating_output_when_artifacts_are_missing() {
        let directory = durability_test_directory("release-empty");
        fs::create_dir_all(directory.join("src-tauri")).unwrap();
        fs::write(directory.join("package.json"), r#"{"version":"0.9.0"}"#).unwrap();
        fs::write(directory.join("src-tauri").join("tauri.conf.json"), r#"{"version":"0.9.0"}"#).unwrap();
        fs::write(directory.join("src-tauri").join("Cargo.toml"), "[package]\nname = \"fixture\"\nversion = \"0.9.0\"\n").unwrap();

        let error = create_release_package(directory.to_string_lossy().to_string(), String::new()).unwrap_err();

        assert!(error.contains("no installer artifacts"));
        assert!(!directory.join("releases").exists());
        fs::remove_dir_all(directory).unwrap();
    }
}

fn main() {
    if let Err(error) = run_app() {
        eprintln!("Diligent Code Studio failed to start: {error}");
    }
}
