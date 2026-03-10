# Release Notes

## v1.0.0 - Initial Public Release (March 10, 2026)

### 🎉 First Official Release

This is the first public release of `cmd-git-copilot-tools`, a powerful command-line tool and library for browsing, searching, and downloading GitHub Copilot customizations (agents, instructions, plugins, prompts, skills, and workflows).

### ✨ Key Features

#### Command-Line Interface

- **Interactive Terminal Browser** - Less-like UI for exploring Copilot tools
- **Category Navigation** - Browse by agents, instructions, plugins, prompts, skills, or workflows
- **Real-time Search** - Fast filtering across all categories with support for category-specific queries
- **Smart Downloads** - Automatic folder organization in `.github/` directories
- **Multi-source Support** - Configure and switch between multiple GitHub repositories
- **GitHub Authentication** - Optional token support for higher rate limits (5,000 vs 60 req/hr)

#### Programmatic API

- **Full Library Export** - Use as a dependency in Node.js/TypeScript projects
- **TypeScript Support** - Complete type definitions included
- **Host-agnostic Engine** - Core modules designed for use in editor extensions or other tools
- **Clean Imports** - Single entry point: `import { ... } from 'cmd-git-copilot-tools'`

### 📦 Installation

```bash
# As a global CLI tool
npm install -g cmd-git-copilot-tools

# As a library dependency
npm install cmd-git-copilot-tools
```

### 🔧 Usage Examples

#### CLI Usage

```bash
# Interactive browser
cmd-copilot-tools

# Download specific tools
cmd-copilot-tools --prompt my-prompt
cmd-copilot-tools --skill quasi-coder --instruction update-docs

# Search across all tools
cmd-copilot-tools --search copilot

# Manage sources
cmd-copilot-tools --source https://github.com/owner/repo mylabel
cmd-copilot-tools --list-source
```

#### Programmatic Usage

```javascript
import {
  loadConfig,
  fetchAllToolsFromSources,
  searchTools,
  filterByCategory,
  downloadItem,
} from 'cmd-git-copilot-tools';

// Load configuration
const config = loadConfig();

// Fetch all tools from configured sources
const allTools = await fetchAllToolsFromSources(
  config.sources,
  config.enterpriseToken
);

// Search and filter
const results = searchTools(allTools, 'agent');
const agents = filterByCategory(allTools, 'agents');

// Download a tool
if (agents.length > 0) {
  await downloadItem(agents[0], process.cwd());
}
```

### 🛠️ Technical Details

#### Package Structure
- **Dual export**: CLI executable (`dist/cli.js`) + Library (`dist/index.js`)
- **TypeScript declarations**: Full `.d.ts` files with source maps
- **CommonJS format**: Compatible with Node.js 18+
- **Minimal dependencies**: Only axios for HTTP requests

#### API Modules
- `config` - Configuration management
- `github` - GitHub REST API client with caching
- `download` - File and directory downloads
- `search` - Search, filter, and selection helpers
- `cache` - In-memory TTL cache
- `permissions` - Authentication preference management

#### Testing

- **118 test cases** across 7 test suites
- Unit tests for all core modules
- Full integration test with live GitHub API
- Programmatic API verification tests

### 📚 Documentation

- **README.md** - Complete usage guide with examples
- **docs/api.md** - Engine API reference for library users
- **docs/configuration.md** - Config file reference
- **docs/permissions.md** - Authentication setup guide
- **docs/git-copilot-tools-browser.md** - Browser usage guide

### 🎯 Default Repository

Ships with [github/awesome-copilot](https://github.com/github/awesome-copilot) as the default source, providing instant access to a curated collection of GitHub Copilot customizations.

### 🔐 Security & Privacy

- **No stored credentials** - Tokens are read from environment variables or gh CLI at runtime
- **Permission prompts** - Explicit opt-in for GitHub authentication
- **Configurable rate limits** - Works with or without authentication

### 📊 Package Stats

- **Package size**: 205 KB (compressed), 1.1 MB (unpacked)
- **Files included**: 67 (source + dist + types)
- **Node.js requirement**: ≥18.0.0
- **License**: MIT

### 🔗 Links

- **Repository**: https://github.com/jhauga/cmd-git-copilot-tools
- **Issues**: https://github.com/jhauga/cmd-git-copilot-tools/issues
- **Documentation**: https://jhauga.github.io/cmd-git-copilot-tools/
- **npm**: https://www.npmjs.com/package/cmd-git-copilot-tools

### 🙏 Credits

This tool is a command-line port of [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools), designed with a host-agnostic engine that can power editor extensions and other integrations.

### 🚀 What's Next

Future releases may include:
- Submodule path exports for tree-shakeable imports
- Additional GitHub API features (issues, discussions)
- Plugin system for custom source adapters
- Watch mode for auto-updating downloaded tools

---

**Full Changelog**: Initial release - all features are new!

For detailed usage instructions, see the [README](README.md) or run `cmd-copilot-tools --help`.
