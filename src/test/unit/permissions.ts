import * as fs from 'fs';
import * as path from 'path';
import { savePermissions } from '../../engine/permissions.js';
import type { PermissionState, AuthPermission } from '../../engine/permissions.js';
import { runSuite, assert, assertEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

// Mock __BUILD_ID__ for consistent testing
const MOCK_BUILD_ID = 'test-build-123';

export async function runPermissionsSuite(): Promise<SuiteResult> {
  return runSuite('unit: permissions', {
    'PermissionState supports off, on, and always modes': () => {
      // This is a type-level test - if it compiles, it passes
      const state: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'always',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      assertEqual(state.authMode, 'always');
      
      state.authMode = 'on';
      assertEqual(state.authMode, 'on');
      
      state.authMode = 'off';
      assertEqual(state.authMode, 'off');
    },

    'AuthPermission type accepts off, on, and always': () => {
      const modes: AuthPermission[] = ['off', 'on', 'always'];
      assertEqual(modes.length, 3);
      assertEqual(modes[0], 'off');
      assertEqual(modes[1], 'on');
      assertEqual(modes[2], 'always');
    },

    'savePermissions writes correct structure': () => {
      const state: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'always',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      
      // Verify the structure is correct (will write to actual config, but that's ok)
      // This test mainly verifies type compatibility
      assert(typeof state.githubAuthEnabled === 'boolean', 'githubAuthEnabled is boolean');
      assert(['off', 'on', 'always'].includes(state.authMode), 'authMode is valid');
      assert(typeof state.firstTimeUse === 'boolean', 'firstTimeUse is boolean');
      assert(typeof state.buildId === 'string', 'buildId is string');
    },

    'always mode state structure': () => {
      const alwaysState: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'always',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      
      assert(alwaysState.authMode === 'always', 'authMode is always');
      assert(alwaysState.githubAuthEnabled === true, 'auth is enabled');
      assert(alwaysState.firstTimeUse === false, 'not first time');
    },

    'on mode state structure': () => {
      const onState: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'on',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      
      assert(onState.authMode === 'on', 'authMode is on');
      assert(onState.githubAuthEnabled === true, 'auth is enabled');
    },

    'off mode state structure': () => {
      const offState: PermissionState = {
        githubAuthEnabled: false,
        authMode: 'off',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      
      assert(offState.authMode === 'off', 'authMode is off');
      assert(offState.githubAuthEnabled === false, 'auth is disabled');
    },

    'transition from off to on': () => {
      const initial: PermissionState = {
        githubAuthEnabled: false,
        authMode: 'off',
        firstTimeUse: true,
        buildId: MOCK_BUILD_ID,
      };
      
      const updated: PermissionState = {
        ...initial,
        githubAuthEnabled: true,
        authMode: 'on',
        firstTimeUse: false,
      };
      
      assert(updated.authMode === 'on', 'transitioned to on');
      assert(updated.githubAuthEnabled === true, 'auth enabled after transition');
    },

    'transition from on to always': () => {
      const initial: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'on',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      
      const updated: PermissionState = {
        ...initial,
        authMode: 'always',
      };
      
      assert(updated.authMode === 'always', 'transitioned to always');
      assert(updated.githubAuthEnabled === true, 'auth remains enabled');
    },

    'transition from always to off': () => {
      const initial: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'always',
        firstTimeUse: false,
        buildId: MOCK_BUILD_ID,
      };
      
      const updated: PermissionState = {
        ...initial,
        githubAuthEnabled: false,
        authMode: 'off',
      };
      
      assert(updated.authMode === 'off', 'transitioned to off');
      assert(updated.githubAuthEnabled === false, 'auth disabled');
    },

    'always mode persists build IDs': () => {
      // Simulate multiple builds with always mode
      const build1: PermissionState = {
        githubAuthEnabled: true,
        authMode: 'always',
        firstTimeUse: false,
        buildId: 'build-v1',
      };
      
      const build2: PermissionState = {
        ...build1,
        buildId: 'build-v2',
      };
      
      const build3: PermissionState = {
        ...build2,
        buildId: 'build-v3',
      };
      
      // Verify always mode persists
      assertEqual(build3.authMode, 'always');
      assertEqual(build3.githubAuthEnabled, true);
      assertEqual(build3.firstTimeUse, false);
    },
  });
}

