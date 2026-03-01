import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Config, RepositorySource } from '../types.js';

const APP_NAME = 'cmd-git-copilot-tools';

function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_NAME);
  }
  return path.join(os.homedir(), '.config', APP_NAME);
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function getDefaultSources(): RepositorySource[] {
  return [
    {
      owner: 'github',
      repo: 'awesome-copilot',
      label: 'GitHub Awesome Copilot',
    },
    {
      owner: 'jhauga',
      repo: 'cmd-git-copilot-tools',
      label: 'CMD Git Copilot Tools',
    },
  ];
}

export function getDefaultConfig(): Config {
  return {
    sources: getDefaultSources(),
    defaultSourceIndex: 0,
    cacheTimeout: 3600000,
    logLevel: 'info',
    checkForUpdates: true,
    allowInsecureEnterpriseCerts: false,
    downloads: {},
  };
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return getDefaultConfig();
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    const defaults = getDefaultConfig();
    return {
      ...defaults,
      ...parsed,
      sources: parsed.sources && parsed.sources.length > 0 ? parsed.sources : defaults.sources,
      defaultSourceIndex: parsed.defaultSourceIndex ?? 0,
    };
  } catch {
    return getDefaultConfig();
  }
}

export function saveConfig(config: Config): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function getActiveSource(config: Config, urlOrLabel?: string): RepositorySource | undefined {
  if (!urlOrLabel) {
    return config.sources[config.defaultSourceIndex] ?? config.sources[0];
  }
  return findSource(config, urlOrLabel);
}

export function findSource(config: Config, urlOrLabel: string): RepositorySource | undefined {
  const normalized = urlOrLabel.toLowerCase().trim();
  return config.sources.find(s => {
    if (s.label && s.label.toLowerCase() === normalized) {
      return true;
    }
    const repoUrl = `https://github.com/${s.owner}/${s.repo}`.toLowerCase();
    const repoUrlGit = `https://github.com/${s.owner}/${s.repo}.git`.toLowerCase();
    return (
      normalized === repoUrl ||
      normalized === repoUrlGit ||
      normalized === `${s.owner}/${s.repo}`.toLowerCase()
    );
  });
}

export function parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string; baseUrl?: string } | null {
  // Support: https://github.com/owner/repo[.git][/tree/branch]
  // Support: https://enterprise.example.com/owner/repo
  const githubPattern = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:\/.*)?$/;
  const match = githubPattern.exec(url);
  if (!match) {return null;}

  const [, host, owner, repo, branch] = match;
  const baseUrl = host !== 'github.com' ? `https://${host}` : undefined;

  return { owner, repo, branch: branch || undefined, baseUrl };
}

export function addSource(config: Config, url: string, label?: string): RepositorySource {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: '${url}'. Expected: https://github.com/owner/repo`);
  }

  const { owner, repo, branch, baseUrl } = parsed;

  // Check for duplicate
  const existing = config.sources.find(
    s => s.owner === owner && s.repo === repo && (s.baseUrl ?? '') === (baseUrl ?? '')
  );
  if (existing) {
    throw new Error(
      `Source '${owner}/${repo}' is already configured${existing.label ? ` as '${existing.label}'` : ''}.`
    );
  }

  const newSource: RepositorySource = { owner, repo };
  if (label) {newSource.label = label;}
  if (branch) {newSource.branch = branch;}
  if (baseUrl) {newSource.baseUrl = baseUrl;}

  config.sources.push(newSource);
  return newSource;
}

export function removeSource(config: Config, urlOrLabel: string): RepositorySource {
  if (config.sources.length <= 1) {
    throw new Error('Cannot remove: only one source is configured. Add another source first.');
  }

  const idx = config.sources.findIndex(s => {
    const normalized = urlOrLabel.toLowerCase().trim();
    if (s.label && s.label.toLowerCase() === normalized) {return true;}
    const repoUrl = `https://github.com/${s.owner}/${s.repo}`.toLowerCase();
    return normalized === repoUrl || normalized === `${s.owner}/${s.repo}`.toLowerCase();
  });

  if (idx === -1) {
    throw new Error(`Source '${urlOrLabel}' not found. Use --list-source to see configured sources.`);
  }

  const [removed] = config.sources.splice(idx, 1);

  // Adjust defaultSourceIndex if needed
  if (config.defaultSourceIndex >= config.sources.length) {
    config.defaultSourceIndex = 0;
  } else if (idx < config.defaultSourceIndex) {
    config.defaultSourceIndex--;
  }

  return removed;
}

export function setDefaultSource(config: Config, urlOrLabel: string): RepositorySource {
  const source = findSource(config, urlOrLabel);
  if (!source) {
    throw new Error(`Source '${urlOrLabel}' not found. Use --list-source to see configured sources.`);
  }
  const idx = config.sources.indexOf(source);
  config.defaultSourceIndex = idx;
  return source;
}

export function listSources(config: Config): void {
  const { sources, defaultSourceIndex } = config;
  if (sources.length === 0) {
    console.log('No sources configured.');
    return;
  }
  console.log('\nConfigured sources:');
  sources.forEach((s, i) => {
    const isDefault = i === defaultSourceIndex;
    const label = s.label ? ` (${s.label})` : '';
    const defaultMark = isDefault ? ' [default]' : '';
    const url = s.baseUrl
      ? `${s.baseUrl}/${s.owner}/${s.repo}`
      : `https://github.com/${s.owner}/${s.repo}`;
    console.log(`  ${i + 1}. ${url}${label}${defaultMark}`);
  });
  console.log('');
}

export { getConfigPath, getConfigDir };
