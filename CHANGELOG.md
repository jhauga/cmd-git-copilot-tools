# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/jhauga/cmd-git-copilot-tools/releases/tag/v1.0.0
