import * as path from 'path';
import * as fs from 'fs';
import { loadConfig, saveConfig, addSource, removeSource, setDefaultSource, findSource, listSources, parseGitHubUrl, getConfigPath } from './engine/config.js';
import { fetchAllToolsFromSources, fetchCategory, getToken, fetchDirectoryTree } from './engine/github.js';
import { downloadItem, downloadItemsByName } from './engine/download.js';
import { searchTools, filterByCategory } from './engine/search.js';
import { runInteractiveUI, printToolsList } from './ui/terminal.js';
import { readConfirm, readLine } from './ui/input.js';
import { loadPermissions, savePermissions } from './engine/permissions.js';
import type { PermissionState } from './engine/permissions.js';
import type { ToolCategory, RepositorySource } from './types.js';
import { CATEGORY_LABELS, ORDERED_CATEGORIES, CATEGORY_DISPLAY } from './types.js';
import { printSuiteResult, printSummary, logResults } from './test/runner.js';
import type { SuiteResult } from './test/runner.js';
import { runSearchSuite } from './test/unit/search.js';
import { runConfigSuite } from './test/unit/config.js';
import { runDownloadSuite } from './test/unit/download.js';
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
  --use <url|label>             Use a specific source for this invocation
  --set-default <url|label>     Set the default source permanently
  --remove-source <url|label>   Remove a configured source
  --list-source                 List all configured source repositories

  --test                        Run all tests (unit + integration)
  --test:<name>                 Run a specific test suite (search, config, download, full)
  --test:log                    Run all tests and save results to logs/ folder
  --test:<name>:log             Run specific suite and save results to logs/ folder
  --log                         Save test results to logs/ (requires --test)

  --permission <on|off>         Enable or disable GitHub authentication
                                  on  - request permission (shows auth options, re-prompts if off)
                                  off - disable GitHub auth (reverts to 60 req/hr unauthenticated)

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
  cmd-copilot-tools --use myrepo --skill my-skill
  cmd-copilot-tools --list-source
  cmd-copilot-tools --test
  cmd-copilot-tools --test:search
  cmd-copilot-tools --test:full:log
  cmd-copilot-tools --test:config --log
  cmd-copilot-tools --permission on
  cmd-copilot-tools --permission off

AUTHENTICATION:
  See docs/permissions.md for full details on GitHub token resolution.
  Manage access with: cmd-copilot-tools --permission <on|off>

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
      arg === '--search' || arg === '--source' || arg === '--use' ||
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
  useSource?: string
): Promise<void> {
  const category = flag as ToolCategory;

  // Resolve sources to use
  let sources = config.sources;
  if (useSource) {
    const src = findSource(config, useSource);
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

const KNOWN_UNIT_TESTS = ['search', 'config', 'download', 'full'];

async function runTests(unitName: string | undefined, doLog: boolean): Promise<void> {
  const suites: SuiteResult[] = [];

  if (!unitName) {
    // Run all: unit tests first, then full integration test
    suites.push(await runSearchSuite());
    suites.push(await runConfigSuite());
    suites.push(await runDownloadSuite());
    suites.push(await runFullTest());
  } else if (unitName === 'search') {
    suites.push(await runSearchSuite());
  } else if (unitName === 'config') {
    suites.push(await runConfigSuite());
  } else if (unitName === 'download') {
    suites.push(await runDownloadSuite());
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
  const allow = await readConfirm('Allow GitHub authentication?');
  const updated: PermissionState = {
    ...perms,
    githubAuthEnabled: allow,
    firstTimeUse: false,
  };
  savePermissions(updated);
  if (allow) {
    console.log('\nGitHub authentication enabled.\n');
  } else {
    console.log('\nRunning without GitHub authentication (60 req/hr limit).\n');
    console.log('You can enable it later with: cmd-copilot-tools --permission on\n');
  }
  return updated;
}

/** Handle `--permission on|off` explicitly. */
async function handlePermissionFlag(value: string, perms: PermissionState): Promise<void> {
  const val = value.toLowerCase().trim();

  if (val !== 'on' && val !== 'off') {
    console.error(`--permission requires 'on' or 'off'. Example: --permission on`);
    process.exit(1);
  }

  if (val === 'off') {
    const updated: PermissionState = { ...perms, githubAuthEnabled: false, firstTimeUse: false };
    savePermissions(updated);
    console.log('GitHub authentication disabled. Running without a token limits API access to 60 req/hr.');
    console.log('To re-enable, run: cmd-copilot-tools --permission on');
    return;
  }

  // val === 'on'
  if (perms.githubAuthEnabled) {
    console.log(`GitHub authentication is already enabled.\n`);
    console.log(AUTH_RESOLUTION_TEXT);
    console.log('\nTo disable, run: cmd-copilot-tools --permission off');
    return;
  }

  // Currently off — run the permission prompt
  console.log(`\n${AUTH_RESOLUTION_TEXT}\n`);
  const allow = await readConfirm('Allow GitHub authentication?');
  const updated: PermissionState = { ...perms, githubAuthEnabled: allow, firstTimeUse: false };
  savePermissions(updated);
  if (allow) {
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
    if (useSource) {
      const src = findSource(config, useSource);
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
      await handleCategoryFlag(category, values.get(flag)!, config, resolveToken(config.enterpriseToken), useSource);
      return;
    }

    // Batch mode: process all active flags together, fetch tools once
    const token = resolveToken(config.enterpriseToken);
    let sources = config.sources;
    if (useSource) {
      const src = findSource(config, useSource);
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
