import * as path from 'path';
import * as fs from 'fs';
import { loadConfig, saveConfig, addSource, removeSource, setDefaultSource, findSource, listSources, parseGitHubUrl, getConfigPath } from './engine/config.js';
import { fetchAllToolsFromSources, fetchCategory, getToken, fetchDirectoryTree } from './engine/github.js';
import { downloadItem, downloadItemsByName } from './engine/download.js';
import { searchTools, filterByCategory } from './engine/search.js';
import { runInteractiveUI, printToolsList } from './ui/terminal.js';
import { readConfirm, readLine, readAuthPermission } from './ui/input.js';
import { loadPermissions, savePermissions } from './engine/permissions.js';
import type { PermissionState } from './engine/permissions.js';
import type { ToolCategory, RepositorySource, Config } from './types.js';
import { CATEGORY_LABELS, ORDERED_CATEGORIES, CATEGORY_DISPLAY } from './types.js';
import { printSuiteResult, printSummary, logResults } from './test/runner.js';
import type { SuiteResult } from './test/runner.js';
import { runSearchSuite } from './test/unit/search.js';
import { runConfigSuite } from './test/unit/config.js';
import { runDownloadSuite } from './test/unit/download.js';
import { runCliSuite } from './test/unit/cli.js';
import { runPermissionsSuite } from './test/unit/permissions.js';
import { runProgrammaticSuite } from './test/unit/programmatic.js';
import { runFullTest } from './test/full.js';

// Load version from package.json
function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

function showHelp(): void {
  console.log(`
cmd-copilot-tools v${getVersion()}

Browse and download GitHub Copilot customizations (agents, instructions, plugins,
prompts, skills, workflows) from configurable GitHub repositories.

USAGE:
  cmd-copilot-tools [options]

OPTIONS:
  (no args)                     Launch interactive terminal browser
  --all                         Show all categories pre-expanded

  --agent [name[,name...]]      Show agents, or download named agent(s)
  --instruction [name[,...]]    Show instructions, or download named instruction(s)
  --plugin [name[,...]]         Show plugins, or download named plugin(s)
  --prompt [name[,...]]         Show prompts, or download named prompt(s)
  --skill [name[,...]]          Show skills, or download named skill(s)
  --workflow [name[,...]]       Show workflows, or download named workflow(s)

  --search <term>[,term...]     Search across all tool categories (non-interactive)

  --source <url> [label]        Add a GitHub repository as a source
  --use <url|label|#>[/path]    Use a specific source for this invocation.
                                Can be a URL, label, or number from --list-source.
                                Optionally append a path (e.g., 2/branch/tools)
  --url <url>                   Use the url passed as a temp source for download
  --set-default <url|label>     Set the default source permanently
  --remove-source <url|label>   Remove a configured source
  --list-source                 List all configured source repositories

  --test                        Run all tests (unit + integration)
  --test:<name>                 Run a specific test suite (search, config, download, cli, permissions, programmatic, full)
  --test:log                    Run all tests and save results to logs/ folder
  --test:<name>:log             Run specific suite and save results to logs/ folder
  --log                         Save test results to logs/ (requires --test)

  --permission [on|off|always]  Manage GitHub authentication
                                  (no arg) - show current permission status
                                  on       - enable for current build (re-prompts after builds)
                                  off      - disable GitHub auth (60 req/hr unauthenticated)
                                  always   - enable permanently (no prompts after builds)

  -h, --help, /?                Show this help message
  -v, --version                 Show version

EXAMPLES:
  cmd-copilot-tools
  cmd-copilot-tools --all
  cmd-copilot-tools --agent
  cmd-copilot-tools --agent my-agent.agent.md
  cmd-copilot-tools --agent my-agent
  cmd-copilot-tools --prompt my-prompt,other-prompt
  cmd-copilot-tools --instruction html-css-style-color-guide,update-code-from-shorthand
  cmd-copilot-tools --search copilot
  cmd-copilot-tools --source https://github.com/owner/repo myrepo
  cmd-copilot-tools --list-source
  cmd-copilot-tools --use 2 --skill my-skill
  cmd-copilot-tools --use myrepo --skill my-skill
  cmd-copilot-tools --use myrepo/branch/tools --agent my-agent
  cmd-copilot-tools --use 2/branch/tools --agent my-agent
  cmd-copilot-tools --url https://github.com/owner/repo --agent my-agent
  cmd-copilot-tools --list-source
  cmd-copilot-tools --test
  cmd-copilot-tools --test:search
  cmd-copilot-tools --test:programmatic
  cmd-copilot-tools --test:full:log
  cmd-copilot-tools --test:config --log
  cmd-copilot-tools --permission
  cmd-copilot-tools --permission on
  cmd-copilot-tools --permission off
  cmd-copilot-tools --permission always

AUTHENTICATION:
  See docs/permissions.md for full details on GitHub token resolution.
  Manage access with: cmd-copilot-tools --permission <on|off|always>

CONFIG FILE:
  ${getConfigPath()}

DOWNLOAD LOCATION:
  Tools are downloaded to .github/<category>/ in the current directory.
`);
}

/**
 * Resolve a search term that may start with a category specifier.
 * "skills game" → "s:game"  (category name followed by search term)
 * "s game"      → "s:game"  (category label followed by search term)
 * "game"        → "game"    (plain search term, no category)
 */
function buildSearchQuery(terms: string[]): string {
  if (terms.length < 2) {
    return terms.join(',');
  }
  const first = terms[0]!.toLowerCase();
  // Check if first term is a short label (e.g. "s", "pl")
  if (CATEGORY_LABELS[first]) {
    return `${first}:${terms.slice(1).join(' ')}`;
  }
  // Check if first term is a full category name (e.g. "skills")
  for (const [label, cat] of Object.entries(CATEGORY_LABELS)) {
    if (cat === first) {
      return `${label}:${terms.slice(1).join(' ')}`;
    }
  }
  // No category specifier — join all as comma-separated independent terms
  return terms.join(',');
}

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string[]>;
  extra: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  const extra: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--help' || arg === '-h' || arg === '/?') {
      flags.add('help');
      i++;
    } else if (arg === '--version' || arg === '-v') {
      flags.add('version');
      i++;
    } else if (arg === '--all') {
      flags.add('all');
      i++;
    } else if (arg === '--list-source') {
      flags.add('list-source');
      i++;
    } else if (
      arg === '--agent' || arg === '--instruction' || arg === '--plugin' ||
      arg === '--prompt' || arg === '--skill' || arg === '--workflow' ||
      arg === '--search' || arg === '--source' || arg === '--use' || arg === '--url' ||
      arg === '--set-default' || arg === '--remove-source' || arg === '--permission'
    ) {
      const flag = arg.slice(2);
      const vals: string[] = [];
      i++;
      // Collect following non-flag args as values
      while (i < argv.length && !argv[i]!.startsWith('--') && argv[i] !== '/?') {
        vals.push(argv[i]!);
        i++;
      }
      values.set(flag, vals);
    } else if (arg === '--test' || arg.startsWith('--test:')) {
      flags.add('test');
      // Parse colon-separated sub-options: --test, --test:log, --test:search, --test:search:log
      const rest = arg.slice('--test'.length); // e.g. '' | ':log' | ':search' | ':search:log'
      if (rest.length > 0) {
        const parts = rest.slice(1).split(':').filter(Boolean);
        const unitParts = parts.filter(p => p !== 'log');
        if (unitParts.length > 0) {values.set('test-unit', [unitParts.join(':')]);}
        if (parts.includes('log')) {flags.add('test-log');}
      }
      i++;
    } else if (arg === '--log') {
      flags.add('log');
      i++;
    } else if (arg.startsWith('--')) {
      // Unknown flag
      console.error(`Unknown option: ${arg}. Use --help for usage.`);
      process.exit(1);
    } else {
      extra.push(arg);
      i++;
    }
  }

  return { flags, values, extra };
}

function splitToolNames(names: string[]): string[] {
  return names.flatMap(n => n.split(',').map(s => s.trim()).filter(Boolean));
}

/**
 * Parse a --use value that may contain an appended path.
 * Examples:
 *   - "mylabel" -> { base: "mylabel", path: undefined }
 *   - "mylabel/develop" -> { base: "mylabel", path: "develop" }
 *   - "https://github.com/owner/repo" -> { base: "https://github.com/owner/repo", path: undefined }
 *   - "https://github.com/owner/repo/extra/path" -> { base: "https://github.com/owner/repo", path: "extra/path" }
 */
export function parseUseSource(useSource: string): { base: string; appendedPath?: string } {
  // Check if it's a URL
  if (useSource.startsWith('http://') || useSource.startsWith('https://')) {
    // Try to parse as GitHub URL
    const parsed = parseGitHubUrl(useSource);
    if (parsed) {
      // It's a valid GitHub URL, extract base
      const baseUrl = parsed.baseUrl || 'https://github.com';
      let base = `${baseUrl}/${parsed.owner}/${parsed.repo}`;
      // Return with no appended path (branch is handled separately)
      return { base, appendedPath: undefined };
    }
    // Not a valid GitHub URL, treat entire string as base
    return { base: useSource, appendedPath: undefined };
  }

  // It's a label or label/path
  // Split on first slash to separate label from path
  const slashIndex = useSource.indexOf('/');
  if (slashIndex === -1) {
    return { base: useSource, appendedPath: undefined };
  }

  const base = useSource.substring(0, slashIndex);
  const appendedPath = useSource.substring(slashIndex + 1);
  
  return { base, appendedPath: appendedPath || undefined };
}

/**
 * Resolve a --use source specification to an actual RepositorySource.
 * If the source has an appended path, it is added to the branch property.
 * Handles cases like:
 *   - "mylabel" -> finds label
 *   - "mylabel/branch" -> finds label, sets branch
 *   - "mylabel/tree/branch" -> finds label, sets branch (strips /tree/)
 *   - "owner/repo" -> finds by owner/repo
 *   - "owner/repo/branch" -> finds by owner/repo, sets branch
 *   - "https://github.com/owner/repo/tree/branch" -> finds source, uses branch from URL
 *   - "1" -> finds source by 1-based index
 *   - "2/branch" -> finds source by index 2, sets branch
 *   - "2/tree/branch" -> finds source by index 2, sets branch (strips /tree/)
 */
export function resolveUseSource(config: Config, useSource: string): RepositorySource | undefined {
  // Check if useSource starts with a digit (numeric index)
  const numericMatch = useSource.match(/^(\d+)(\/.*)?$/);
  if (numericMatch) {
    const index = parseInt(numericMatch[1]!, 10) - 1; // Convert to 0-based index
    let appendedPath = numericMatch[2] ? numericMatch[2].substring(1) : undefined; // Remove leading slash
    
    // Handle /tree/ syntax (e.g., "2/tree/branch" -> branch = "branch")
    if (appendedPath && appendedPath.startsWith('tree/')) {
      appendedPath = appendedPath.substring(5); // Remove "tree/"
    }
    
    if (index >= 0 && index < config.sources.length) {
      const src = config.sources[index]!;
      
      if (appendedPath) {
        // Clone the source and add the appended path
        const cloned: RepositorySource = { ...src };
        if (cloned.branch) {
          cloned.branch = `${cloned.branch}/${appendedPath}`;
        } else {
          cloned.branch = appendedPath;
        }
        return cloned;
      }
      
      return src;
    }
    
    // Invalid numeric index
    return undefined;
  }
  
  // First, try to find the source as-is (no appended path)
  let src = findSource(config, useSource);
  if (src) {
    return src;
  }

  // If not found and it's a URL, parse and try again
  if (useSource.startsWith('http://') || useSource.startsWith('https://')) {
    const parsed = parseGitHubUrl(useSource);
    if (parsed) {
      const baseUrl = parsed.baseUrl || 'https://github.com';
      const base = `${baseUrl}/${parsed.owner}/${parsed.repo}`;
      src = findSource(config, base);
      
      if (src) {
        // If the URL contains branch info, apply it
        if (parsed.branch) {
          const cloned: RepositorySource = { ...src };
          cloned.branch = parsed.branch;
          return cloned;
        }
        return src;
      }
    }
    return undefined;
  }

  // Not a URL, try splitting at slashes to find base + appended path
  // Handle GitHub-style /tree/ syntax: "label/tree/branch" -> "label" with branch "branch"
  const treeIndex = useSource.indexOf('/tree/');
  if (treeIndex !== -1) {
    const base = useSource.substring(0, treeIndex);
    const branch = useSource.substring(treeIndex + 6); // Skip "/tree/"
    
    src = findSource(config, base);
    if (src && branch) {
      const cloned: RepositorySource = { ...src };
      cloned.branch = branch;
      return cloned;
    }
  }

  // Try from right to left: "owner/repo/feature/branch" -> try "owner/repo/feature", then "owner/repo"
  const parts = useSource.split('/');
  
  for (let i = parts.length - 1; i > 0; i--) {
    const base = parts.slice(0, i).join('/');
    const appendedPath = parts.slice(i).join('/');
    
    src = findSource(config, base);
    if (src && appendedPath) {
      // Found a match! Clone and add the appended path
      const cloned: RepositorySource = { ...src };
      if (cloned.branch) {
        cloned.branch = `${cloned.branch}/${appendedPath}`;
      } else {
        cloned.branch = appendedPath;
      }
      return cloned;
    }
  }

  // No match found
  return undefined;
}

async function handleSourceAdd(config: ReturnType<typeof loadConfig>, vals: string[], token?: string): Promise<void> {
  if (vals.length === 0) {
    console.error('--source requires a URL. Example: --source https://github.com/owner/repo');
    process.exit(1);
  }

  const [url, ...labelParts] = vals;
  const label = labelParts.join(' ') || undefined;

  try {
    const newSource = addSource(config, url!, label);

    console.log(`\nAdding source: ${url}${label ? ` (${label})` : ''}`);
    console.log('Checking repository for standard folders...');

    // Check for standard folders
    const foundCategories: ToolCategory[] = [];
    for (const cat of ORDERED_CATEGORIES) {
      try {
        const entries = await fetchDirectoryTree(newSource, cat, token);
        if (entries.length > 0) {foundCategories.push(cat);}
      } catch {
        // Folder not found, skip
      }
    }

    if (foundCategories.length > 0) {
      console.log(`\nFound standard folders: ${foundCategories.join(', ')}`);
    } else {
      console.log('\nNo standard folders found. You may need to configure folder mappings.');
      console.log('Run with the repository to see available folders:\n');

      // Show top-level directories for the user
      try {
        const rootEntries = await fetchDirectoryTree(newSource, '', token);
        const dirs = rootEntries.filter(e => e.type === 'dir');
        if (dirs.length > 0) {
          console.log('Available directories in repository root:');
          dirs.forEach(d => console.log(`  - ${d.name}`));
          console.log('\nEdit the config file to set folderMappings:');
          console.log(`  ${getConfigPath()}`);
        }
      } catch {
        // Ignore errors fetching root
      }
    }

    saveConfig(config);
    console.log(`\nSource added successfully.`);
    listSources(config);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function handleCategoryFlag(
  flag: string,
  vals: string[],
  config: ReturnType<typeof loadConfig>,
  token: string | undefined,
  useSource?: string,
  tempSource?: RepositorySource
): Promise<void> {
  const category = flag as ToolCategory;

  // Resolve sources to use
  let sources = config.sources;
  if (tempSource) {
    sources = [tempSource];
  } else if (useSource) {
    const src = resolveUseSource(config, useSource);
    if (!src) {
      console.error(`Source '${useSource}' not found. Use --list-source to see configured sources.`);
      process.exit(1);
    }
    sources = [src];
  }

  const toolNames = splitToolNames(vals);

  if (toolNames.length === 0) {
    // Show interactive list filtered to this category
    if (process.stdout.isTTY) {
      await runInteractiveUI(config, category);
    } else {
      // Non-interactive: fetch and print
      const items = await fetchAllToolsFromSources(sources, token, config.cacheTimeout);
      const filtered = filterByCategory(items, category);
      printToolsList(filtered, category);
    }
    return;
  }

  // Download specified tools
  const items = await fetchAllToolsFromSources(sources, token, config.cacheTimeout);
  const catItems = filterByCategory(items, category);

  try {
    await downloadItemsByName(catItems, toolNames, process.cwd(), token);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const KNOWN_UNIT_TESTS = ['search', 'config', 'download', 'cli', 'permissions', 'programmatic', 'full'];

async function runTests(unitName: string | undefined, doLog: boolean): Promise<void> {
  const suites: SuiteResult[] = [];

  if (!unitName) {
    // Run all: unit tests first, then full integration test
    suites.push(await runSearchSuite());
    suites.push(await runConfigSuite());
    suites.push(await runDownloadSuite());
    suites.push(await runCliSuite());
    suites.push(await runPermissionsSuite());
    suites.push(await runProgrammaticSuite());
    suites.push(await runFullTest());
  } else if (unitName === 'search') {
    suites.push(await runSearchSuite());
  } else if (unitName === 'config') {
    suites.push(await runConfigSuite());
  } else if (unitName === 'download') {
    suites.push(await runDownloadSuite());
  } else if (unitName === 'cli') {
    suites.push(await runCliSuite());
  } else if (unitName === 'permissions') {
    suites.push(await runPermissionsSuite());
  } else if (unitName === 'programmatic') {
    suites.push(await runProgrammaticSuite());
  } else if (unitName === 'full') {
    suites.push(await runFullTest());
  } else {
    console.error(`Unknown test suite: '${unitName}'. Available: ${KNOWN_UNIT_TESTS.join(', ')}`);
    process.exit(1);
  }

  for (const suite of suites) {
    printSuiteResult(suite);
  }
  printSummary(suites);

  if (doLog) {
    const logDir = path.join(process.cwd(), 'logs');
    const logFile = logResults(suites, logDir);
    console.log(`\nLog saved: ${logFile}`);
  }

  const totalFailed = suites.reduce((sum, s) => sum + s.results.filter(r => !r.passed).length, 0);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

const AUTH_RESOLUTION_TEXT = `\
Token resolution order (first match wins):
  1. GITHUB_TOKEN environment variable
  2. GH_TOKEN environment variable
  3. gh CLI  →  run: gh auth login

No credentials are stored by this tool. Tokens are read at runtime only.`;

/** Shown on the very first non-help invocation. Saves the user's choice. */
async function runFirstTimePermissionPrompt(perms: PermissionState): Promise<PermissionState> {
  console.log(`
Welcome to cmd-copilot-tools!

This tool can use your GitHub credentials to access the GitHub API with a
higher rate limit (5,000 req/hr vs 60 req/hr unauthenticated).

${AUTH_RESOLUTION_TEXT}
`);
  console.log('To always allow authentication without prompting after builds, input [always]\n');
  const response = await readAuthPermission('Allow GitHub authentication?');
  
  let authMode: 'off' | 'on' | 'always';
  let githubAuthEnabled: boolean;
  
  if (response === 'always') {
    authMode = 'always';
    githubAuthEnabled = true;
  } else if (response === 'yes') {
    authMode = 'on';
    githubAuthEnabled = true;
  } else {
    authMode = 'off';
    githubAuthEnabled = false;
  }
  
  const updated: PermissionState = {
    ...perms,
    githubAuthEnabled,
    authMode,
    firstTimeUse: false,
  };
  savePermissions(updated);
  
  if (authMode === 'always') {
    console.log('\nGitHub authentication enabled (always mode - no future prompts).\n');
  } else if (githubAuthEnabled) {
    console.log('\nGitHub authentication enabled.\n');
  } else {
    console.log('\nRunning without GitHub authentication (60 req/hr limit).\n');
    console.log('You can enable it later with: cmd-copilot-tools --permission on\n');
  }
  return updated;
}

/** Handle `--permission [on|off|always]` explicitly. No argument shows current status. */
async function handlePermissionFlag(value: string, perms: PermissionState): Promise<void> {
  const val = value.toLowerCase().trim();

  // No argument - show current status
  if (val === '') {
    console.log('\nCurrent permission status:\n');
    
    if (perms.authMode === 'always') {
      console.log('  GitHub authentication: ENABLED (always mode)');
      console.log('  Status: Authentication will remain enabled after builds');
    } else if (perms.authMode === 'on') {
      console.log('  GitHub authentication: ENABLED');
      console.log('  Status: Will re-prompt after npm run compile');
    } else {
      console.log('  GitHub authentication: DISABLED');
      console.log('  Status: Using unauthenticated API access (60 req/hr)');
    }
    
    console.log('\nChange permission:');
    console.log('  cmd-copilot-tools --permission on      (enable with re-prompts)');
    console.log('  cmd-copilot-tools --permission always  (enable permanently)');
    console.log('  cmd-copilot-tools --permission off     (disable)');
    console.log('\nSee docs/permissions.md for more details.');
    return;
  }

  if (val !== 'on' && val !== 'off' && val !== 'always') {
    console.error(`--permission requires 'on', 'off', or 'always', or no argument to show status.`);
    console.error('Example: cmd-copilot-tools --permission always');
    process.exit(1);
  }

  if (val === 'off') {
    const updated: PermissionState = { ...perms, githubAuthEnabled: false, authMode: 'off', firstTimeUse: false };
    savePermissions(updated);
    console.log('GitHub authentication disabled. Running without a token limits API access to 60 req/hr.');
    console.log('To re-enable, run: cmd-copilot-tools --permission on');
    return;
  }

  if (val === 'always') {
    const updated: PermissionState = { ...perms, githubAuthEnabled: true, authMode: 'always', firstTimeUse: false };
    savePermissions(updated);
    console.log('GitHub authentication enabled (always mode - no future prompts after builds).\n');
    console.log(AUTH_RESOLUTION_TEXT);
    console.log('\nTo disable, run: cmd-copilot-tools --permission off');
    return;
  }

  // val === 'on'
  if (perms.githubAuthEnabled && perms.authMode !== 'off') {
    const modeText = perms.authMode === 'always' ? ' (always mode)' : '';
    console.log(`GitHub authentication is already enabled${modeText}.\n`);
    console.log(AUTH_RESOLUTION_TEXT);
    console.log('\nTo disable, run: cmd-copilot-tools --permission off');
    console.log('For always-on mode, run: cmd-copilot-tools --permission always');
    return;
  }

  // Currently off — run the permission prompt
  console.log(`\n${AUTH_RESOLUTION_TEXT}\n`);
  console.log('To always allow authentication without prompting after builds, input [always]\n');
  const response = await readAuthPermission('Allow GitHub authentication?');
  
  let authMode: 'off' | 'on' | 'always';
  let githubAuthEnabled: boolean;
  
  if (response === 'always') {
    authMode = 'always';
    githubAuthEnabled = true;
  } else if (response === 'yes') {
    authMode = 'on';
    githubAuthEnabled = true;
  } else {
    authMode = 'off';
    githubAuthEnabled = false;
  }
  
  const updated: PermissionState = { ...perms, githubAuthEnabled, authMode, firstTimeUse: false };
  savePermissions(updated);
  
  if (authMode === 'always') {
    console.log('\nGitHub authentication enabled (always mode - no future prompts).\n');
  } else if (githubAuthEnabled) {
    console.log('\nGitHub authentication enabled.\n');
  } else {
    console.log('\nPermission not granted. Running without GitHub authentication (60 req/hr limit).\n');
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { flags, values, extra } = parseArgs(argv);

  if (flags.has('help')) {
    showHelp();
    return;
  }

  if (flags.has('version')) {
    console.log(`cmd-copilot-tools v${getVersion()}`);
    return;
  }

  // Load (and if needed reset) permission state
  let perms = loadPermissions();

  // First-time use: show permission prompt before doing anything else
  if (perms.firstTimeUse) {
    perms = await runFirstTimePermissionPrompt(perms);
  }

  // Handle --permission before any network activity
  if (values.has('permission')) {
    const permVal = values.get('permission')?.[0] ?? '';
    await handlePermissionFlag(permVal, perms);
    return;
  }

  // Resolve token only when the user has granted permission
  const resolveToken = (enterpriseToken?: string) =>
    perms.githubAuthEnabled ? getToken(undefined, enterpriseToken) : undefined;

  // --log requires --test
  if (flags.has('log') && !flags.has('test')) {
    console.error('--log requires --test. Example: --test --log or --test:log');
    process.exit(1);
  }

  if (flags.has('test')) {
    const unitName = values.get('test-unit')?.[0];
    const doLog = flags.has('test-log') || flags.has('log');
    await runTests(unitName, doLog);
    return;
  }

  const config = loadConfig();
  const useSource = values.get('use')?.[0];
  let tempUrl: string | undefined = values.get('url')?.[0];

  // Validate and parse --url if provided
  let tempSource: RepositorySource | undefined;
  if (tempUrl) {
    const parsed = parseGitHubUrl(tempUrl);
    if (!parsed) {
      console.error(`Invalid GitHub URL: '${tempUrl}'. Expected: https://github.com/owner/repo`);
      process.exit(1);
    }
    tempSource = {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
      baseUrl: parsed.baseUrl,
    };
  }

  // --url and --use are mutually exclusive
  if (tempUrl && useSource) {
    console.error('Cannot use both --url and --use options together.');
    process.exit(1);
  }

  if (flags.has('list-source')) {
    listSources(config);
    return;
  }

  if (values.has('source')) {
    await handleSourceAdd(config, values.get('source')!, resolveToken(config.enterpriseToken));
    return;
  }

  if (values.has('set-default')) {
    const urlOrLabel = values.get('set-default')?.[0];
    if (!urlOrLabel) {
      console.error('--set-default requires a URL or label. Use --list-source to see options.');
      process.exit(1);
    }
    try {
      const src = setDefaultSource(config, urlOrLabel);
      saveConfig(config);
      const label = src.label || `${src.owner}/${src.repo}`;
      console.log(`Default source set to: ${label}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (values.has('remove-source')) {
    const urlOrLabel = values.get('remove-source')?.[0];
    if (!urlOrLabel) {
      console.error('--remove-source requires a URL or label. Use --list-source to see options.');
      process.exit(1);
    }
    try {
      const src = findSource(config, urlOrLabel);
      if (!src) {
        console.error(`Source '${urlOrLabel}' not found. Use --list-source to see configured sources.`);
        process.exit(1);
      }
      const label = src.label || `${src.owner}/${src.repo}`;
      const confirmed = await readConfirm(`Remove source '${label}'?`);
      if (confirmed) {
        removeSource(config, urlOrLabel);
        saveConfig(config);
        console.log(`Removed source: ${label}`);
        listSources(config);
      } else {
        console.log('Aborted.');
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (values.has('search')) {
    const searchTerms = values.get('search');
    if (!searchTerms || searchTerms.length === 0) {
      console.error('--search requires a search term. Example: --search copilot');
      process.exit(1);
    }
    const query = buildSearchQuery(searchTerms);
    const token = resolveToken(config.enterpriseToken);

    let sources = config.sources;
    if (tempSource) {
      sources = [tempSource];
    } else if (useSource) {
      const src = resolveUseSource(config, useSource);
      if (!src) {
        console.error(`Source '${useSource}' not found. Use --list-source to see configured sources.`);
        process.exit(1);
      }
      sources = [src];
    }

    const items = await fetchAllToolsFromSources(sources, token, config.cacheTimeout);
    const results = searchTools(items, query);

    if (results.length === 0) {
      console.log(`No tools found matching '${query}'`);
      process.exit(0);
    }

    printToolsList(results, 'all');
    return;
  }

  // Category-specific flags
  const categoryFlags: Array<[string, ToolCategory]> = [
    ['agent', 'agents'],
    ['instruction', 'instructions'],
    ['plugin', 'plugins'],
    ['prompt', 'prompts'],
    ['skill', 'skills'],
    ['workflow', 'workflows'],
  ];

  const activeFlags = categoryFlags.filter(([flag]) => values.has(flag));

  if (activeFlags.length > 0) {
    const anyHasArgs = activeFlags.some(
      ([flag]) => splitToolNames(values.get(flag) ?? []).length > 0
    );

    // Single flag with no args: interactive/list mode (existing behaviour)
    if (activeFlags.length === 1 && !anyHasArgs) {
      const [flag, category] = activeFlags[0]!;
      await handleCategoryFlag(category, values.get(flag)!, config, resolveToken(config.enterpriseToken), useSource, tempSource);
      return;
    }

    // Batch mode: process all active flags together, fetch tools once
    const token = resolveToken(config.enterpriseToken);
    let sources = config.sources;
    if (tempSource) {
      sources = [tempSource];
    } else if (useSource) {
      const src = resolveUseSource(config, useSource);
      if (!src) {
        console.error(`Source '${useSource}' not found. Use --list-source to see configured sources.`);
        process.exit(1);
      }
      sources = [src];
    }

    const allItems = await fetchAllToolsFromSources(sources, token, config.cacheTimeout);
    const notices: string[] = [];

    for (const [flag, category] of activeFlags) {
      const toolNames = splitToolNames(values.get(flag) ?? []);

      if (toolNames.length === 0) {
        notices.push(`--${flag}: no names provided, skipped (use --${flag} alone to browse interactively)`);
        continue;
      }

      const catItems = filterByCategory(allItems, category);
      for (const name of toolNames) {
        try {
          await downloadItemsByName(catItems, [name], process.cwd(), token);
        } catch (err) {
          notices.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (notices.length > 0) {
      console.log('\nNotices:');
      for (const notice of notices) {
        console.log(`  ${notice}`);
      }
    }

    return;
  }

  // Default: interactive terminal UI
  if (process.stdout.isTTY) {
    const initialCategory: ToolCategory | 'all' | null = flags.has('all') ? 'all' : null;
    await runInteractiveUI(config, initialCategory);
  } else {
    // Non-interactive (piped): print all tools
    const token = resolveToken(config.enterpriseToken);
    const items = await fetchAllToolsFromSources(config.sources, token, config.cacheTimeout);
    printToolsList(items, 'all');
  }
}

main().catch(err => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
