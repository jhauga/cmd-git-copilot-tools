import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CopilotItem, DownloadMetadata, GitHubFileEntry, RepositorySource } from '../types.js';
import { DOWNLOAD_PATHS } from '../types.js';
import { getDirectoryContents, getFileContent } from './github.js';

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function downloadFile(
  downloadUrl: string,
  destPath: string,
  token?: string
): Promise<string> {
  const content = await getFileContent(downloadUrl, token);
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, content, 'utf-8');
  return content;
}

async function downloadDirectory(
  repo: RepositorySource,
  repoPath: string,
  destDir: string,
  token?: string
): Promise<void> {
  const entries = await getDirectoryContents(repo, repoPath, token);
  ensureDir(destDir);

  for (const entry of entries) {
    const entryDest = path.join(destDir, entry.name);
    if (entry.type === 'dir') {
      await downloadDirectory(repo, entry.path, entryDest, token);
    } else if (entry.type === 'file' && entry.download_url) {
      await downloadFile(entry.download_url, entryDest, token);
    }
  }
}

export async function downloadItem(
  item: CopilotItem,
  destDir: string,
  token?: string
): Promise<DownloadMetadata> {
  const categoryPath = DOWNLOAD_PATHS[item.category];
  const targetBase = path.join(destDir, categoryPath);

  let localPath: string;
  let contentForHash: string;

  if (item.file.type === 'dir') {
    // Skills and plugins: download entire directory
    localPath = path.join(targetBase, item.name);
    await downloadDirectory(item.repo, item.file.path, localPath, token);
    // Use path as hash source for directories
    contentForHash = item.file.path + item.file.sha;
  } else {
    // Regular files
    localPath = path.join(targetBase, item.name);
    if (!item.file.download_url) {
      throw new Error(`No download URL for '${item.name}'`);
    }
    contentForHash = await downloadFile(item.file.download_url, localPath, token);
  }

  const metadata: DownloadMetadata = {
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    repoOwner: item.repo.owner,
    repoName: item.repo.repo,
    downloadTimestamp: Date.now(),
    sha: sha256(contentForHash),
    size: item.file.size,
    downloadUrl: item.file.download_url ?? '',
    localPath,
  };

  return metadata;
}

export async function downloadItemsByName(
  items: CopilotItem[],
  names: string[],
  destDir: string,
  token?: string
): Promise<DownloadMetadata[]> {
  const results: DownloadMetadata[] = [];

  for (const rawName of names) {
    // Allow optional extension suffix
    const normalized = rawName.toLowerCase().trim();
    const matching = items.filter(item => {
      const itemName = item.name.toLowerCase();
      return (
        itemName === normalized ||
        itemName === normalized + '.md' ||
        itemName.replace(/\.(agent|instruction|prompt|workflow)\.md$/, '') === normalized ||
        itemName.replace(/\.md$/, '') === normalized
      );
    });

    if (matching.length === 0) {
      throw new Error(`Tool '${rawName}' not found. Use --search to find available tools.`);
    }

    for (const match of matching) {
      const meta = await downloadItem(match, destDir, token);
      results.push(meta);
      console.log(`Downloaded: ${match.name} → ${meta.localPath}`);
    }
  }

  return results;
}

export function getFileSizeDisplay(bytes: number): string {
  if (bytes < 1024) {return `${bytes}B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
