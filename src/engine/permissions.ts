import * as fs from 'fs';
import * as path from 'path';
import { getConfigDir } from './config.js';

// Replaced by esbuild's `define` at compile time with a timestamp string.
// Declared here so TypeScript is satisfied; the runtime value comes from the bundle.
declare const __BUILD_ID__: string;

export type AuthPermission = 'off' | 'on' | 'always';

export interface PermissionState {
  /** Whether the user has authorised GitHub token resolution. */
  githubAuthEnabled: boolean;
  /** Permission mode: 'off' (disabled), 'on' (prompt each build), 'always' (never prompt) */
  authMode: AuthPermission;
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

  // Determine auth mode from saved state
  const authMode: AuthPermission = saved.authMode || (saved.githubAuthEnabled ? 'on' : 'off');
  const githubAuthEnabled = authMode !== 'off';

  // A new build resets the first-time flag UNLESS authMode is 'always'
  if (saved.buildId !== __BUILD_ID__) {
    // If 'always' mode, don't reset - user wants to skip prompts permanently
    if (authMode === 'always') {
      return { 
        githubAuthEnabled: true, 
        authMode: 'always',
        firstTimeUse: false, 
        buildId: __BUILD_ID__ 
      };
    }
    // For other modes, reset to first-time state
    return { 
      githubAuthEnabled: false,
      authMode: 'off',
      firstTimeUse: true, 
      buildId: __BUILD_ID__ 
    };
  }

  return {
    githubAuthEnabled,
    authMode,
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
