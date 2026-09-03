# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-beta.1] - 2026-09-03

### Added

#### Download Location

- Added the `aiFolder` property, which sets the parent folder downloaded tools are organized under (default: `.github`)
  - Configurable per source, so one repository can download to a different folder than the rest
  - Configurable globally through the config file and the `--set-default` command
- Added the `-f, --folder <path>` option, which sets the A.I. folder for a single run and bypasses every configured default
  - The only place an absolute path is accepted
  - Works with named downloads and with the interactive browser
- Added the `folder=` qualifier to `--set-default`, which saves the default A.I. folder
  - `--set-default folder=.claude` makes `.claude/` the default instead of `.github/`
  - The qualifier is strict: only the exact word `folder` followed by `=` is read as a folder, so `--set-default <url|label>` keeps its original meaning
- Added `AbsoluteFolderPathError`, raised when an absolute path is given to the saved default. Absolute paths are detected in POSIX, Windows drive, UNC, and home-anchored forms on every platform
- Added `--list-source` output for the default A.I. folder and for any source that overrides it

#### Programmatic API

- Added the `engine/folder.ts` module, exporting `isAbsolutePath`, `normalizeAiFolder`, `resolveAiFolder`, and `resolveCategoryDir`
- Added the `DownloadOptions` argument to `downloadItem` and `downloadItemsByName`, carrying `folderOverride` and `configFolder`
- Added `setDefaultFolder` to the config module, and the `DEFAULT_AI_FOLDER` constant

#### Tests

- Added the `folder` test suite covering absolute path detection, folder normalization, resolution precedence, path composition, the `--set-default` qualifier, and the absolute path rejection (`--test:folder`, `npm run test:folder`)
- Added an integration case that downloads into a custom A.I. folder and verifies the destination

### Changed

- Download paths are now resolved at download time rather than read from a fixed table. `DOWNLOAD_PATHS` remains exported and still describes the default `.github` layout
- The integration test resolves expected download paths the same way the downloader does, so a source with its own `aiFolder` no longer breaks the assertions

### Fixed

- The `User-Agent` header sent to the GitHub API reports the package version instead of a hardcoded `1.0.0`
- `loadPermissions` no longer throws `ReferenceError: __BUILD_ID__ is not defined` when the package is imported as a library. The build ID is now defined for the library bundle as well as the CLI bundle

## [1.2.0] - 2026-06-12

### Added

#### Categories

- Added `cookbook` category for browsing Copilot cookbook recipes and examples
  - Short label: `ck` (e.g. `--search ck:recipe-name`)
  - Default download path: `.github/cookbook`
- Added `hooks` category for browsing Copilot hook definitions
  - Short label: `h` (e.g. `--search h:hook-name`)
  - Default download path: `.github/hooks`

## [1.1.0] - 2026-03-11

### Changed

#### Configuration

- Added `--url` and `--source` argument syntax for inline source configuration with folder mapping overrides
  - Single mapping: `--url:skills=root` or `--source:plugins="custom/path"`
  - Multiple mappings: `--url:[skills=root,plugins="path"]` or `--source:[a=null,p="path"]`
  - Valid mapping values: folder paths, `"root"`, or `"null"`

#### Search

- Search (`--search`) now respects `--use` and `--url` source specifications, allowing targeted searches against a specific configured source
- Added source header display in search results when querying multiple sources, showing the repository each result set originates from

### Fixed

#### Dependencies

- Replaced deprecated Node.js `url.parse()` with a custom `parseGitHubUrl()` regex-based parser supporting standard GitHub URLs, branch paths, and GitHub Enterprise URLs

## [1.0.0] - 2026-03-10

### Added

#### Command-Line Interface

- Interactive terminal browser with less-like navigation
- Category-based browsing (agents, instructions, plugins, prompts, skills, workflows)
- Real-time search with category-specific filtering (e.g., `/a:agent-name`)
- Smart download system with automatic `.github/` folder organization
- Multi-repository source management (`--source`, `--use`, `--list-source`)
- GitHub authentication support with configurable permissions
- Comprehensive help system (`--help`)

#### Programmatic API

- Full library export from `cmd-git-copilot-tools` package
- TypeScript type definitions (`.d.ts` files with source maps)
- Host-agnostic engine modules (config, github, download, search, cache, permissions)
- Clean import syntax: `import { loadConfig, fetchAllTools } from 'cmd-git-copilot-tools'`

#### Configuration

- JSON config file with multiple source support
- Custom folder mappings for non-standard repository structures
- Configurable cache timeout and log levels
- GitHub Enterprise support with custom base URLs
- Permission management for authentication preferences

#### Testing

- 118 test cases across 7 test suites
- Unit tests for all core modules (search, config, download, cli, permissions, programmatic)
- Full integration test with live GitHub API
- Test logging with `--test:log` support

#### Documentation

- Complete README with CLI and programmatic usage examples
- Engine API reference (`docs/api.md`)
- Configuration guide (`docs/configuration.md`)
- Permission system documentation (`docs/permissions.md`)
- Browser usage guide (`docs/git-copilot-tools-browser.md`)

#### Features
- Smart caching with TTL for improved performance
- Multi-category downloads in a single command
- Extension-optional tool naming (e.g., `--prompt my-prompt` or `--prompt my-prompt.prompt.md`)
- Graceful error handling with helpful notices
- Support for folder-based tools (skills, plugins)
- Rate limit awareness (authenticated: 5,000 req/hr, unauthenticated: 60 req/hr)

### Technical Details

#### Package

- Dual bundle: CLI executable + library export
- CommonJS format for Node.js compatibility
- Node.js ≥18.0.0 requirement
- MIT license
- Package size: 205 KB compressed, 1.1 MB unpacked

#### Dependencies

- Zero runtime dependencies — uses Node.js native `fetch` API

#### Build System

- TypeScript compilation with declaration generation
- ESBuild bundling for both CLI and library
- ESLint for code quality
- Concurrent watch mode for development

### Default Configuration

- Default repository: [github/awesome-copilot](https://github.com/github/awesome-copilot)
- Cache timeout: 1 hour (3,600,000 ms)
- Log level: info
- Check for updates: enabled

[1.2.0]: https://github.com/jhauga/cmd-git-copilot-tools/releases/tag/v1.2.0
[1.1.0]: https://github.com/jhauga/cmd-git-copilot-tools/releases/tag/v1.1.0
[1.0.0]: https://github.com/jhauga/cmd-git-copilot-tools/releases/tag/v1.0.0
