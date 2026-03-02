import * as fs from 'fs';
import * as path from 'path';
import { getConfigDir } from './config.js';

// Replaced by esbuild's `define` at compile time with a timestamp string.
// Declared here so TypeScript is satisfied; the runtime value comes from the bundle.
declare const __BUILD_ID__: string;

export interface PermissionState {
  /** Whether the user has authorised GitHub token resolution. */
  githubAuthEnabled: boolean;
  /** True until the user has responded to the first-time permission prompt. */
  firstTimeUse: boolean;
  /** Build ID baked in at compile time — changes on every `npm run compile`. */
  buildId: string;
}

function getPermissionsPath(): string {
  return path.join(getConfigDir(), 'permissions.json');
}

/** Load permission state, resetting firstTimeUse whenever a new build is detected. */
export function loadPermissions(): PermissionState {
  const permPath = getPermissionsPath();
  let saved: Partial<PermissionState> = {};

  if (fs.existsSync(permPath)) {
    try {
      saved = JSON.parse(fs.readFileSync(permPath, 'utf-8')) as Partial<PermissionState>;
    } catch {
      // Corrupt file — treat as fresh state
    }
  }

  // A new build resets the first-time flag so the permission prompt re-runs
  if (saved.buildId !== __BUILD_ID__) {
    return { githubAuthEnabled: false, firstTimeUse: true, buildId: __BUILD_ID__ };
  }

  return {
    githubAuthEnabled: saved.githubAuthEnabled ?? false,
    firstTimeUse: saved.firstTimeUse ?? true,
    buildId: __BUILD_ID__,
  };
}

/** Persist permission state to disk. Credentials are never written here. */
export function savePermissions(state: PermissionState): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(getPermissionsPath(), JSON.stringify(state, null, 2), 'utf-8');
}
