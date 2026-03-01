# Command-line `git` Copilot Tools TODO

## Features

### Major Features

- [ ] **Custom Download Behaviour** - CLI configuration to specify where and how to download tools
  - [ ] Refactor existing download functions into reusable, configurable components
    - [ ] Keep UI/UX simple with strict constraints to prevent unexpected downloads
  - [ ] Allow user to specify target folder(s) for downloaded tools via config or flags
  - [ ] Allow user to map tool metadata (name, description, version, etc.)
  - [ ] Add **configuration types** to categorize settings:
    - `config-download-folder` - where tools are saved
    - `config-tool` - tool-specific settings
    - `config-data` - data/metadata handling
    - `config-support` - supporting file settings
  - [ ] Add **download mode types** to control download behavior:
    - `config-folder` - folder-level settings
    - `config-download` - download action settings
  - [ ] Implement folder naming using configuration types:
    - [ ] **Single-file download mode** - For downloading individual files
      - Example: downloading `fix-bugs.instructions.md` from the Instructions category
    - [ ] **Multi-file download mode** - For downloading folders with multiple files
      - Used when a tool has supporting files (assets, references, scripts)
      - Example: downloading a skill folder that includes `SKILL.md` plus a `references/` subfolder
      - User can configure: subfolder naming, subfolder location, how to handle each file type
  - [ ] Classify files in a tool's folder by type:
    - **Tool types** (main files): `agent`, `instruction`, `plugin`, `prompt`, `skill`, `workflow`
    - **Data types** (metadata files): `mapping-data`, `metadata`, `readme`
      - Note: `mapping-data` refers to file path information (can be a single line)
    - **Support types** (helper files): `asset`, `reference`, `script`
  - [ ] Write tests for custom download behaviour using preset configurations
- [ ] **Bulk operations** - Allow users to select and download multiple items at once in the interactive terminal list
- [ ] **Favorites/bookmarking system** - Let users star frequently used items with auto-update on new versions
- [ ] **Local file management** - List and manage downloaded items from the command line (view, update, delete)
- [ ] **Shell completions** - Generate shell completion scripts for bash, zsh, fish, and PowerShell

### New Download Tools

- [ ] **`cookbook` and recipe downloading** - Download Copilot **Cookbook** tools and/or recipes
- [ ] **`hooks`** - Download Copilot **Hooks** or automated workflows
- [ ] **`agentic-workflow`** - Download Copilot **Agentic Workflows** to run coding agents in actions

### Minor Features

- [ ] **Enhanced search with sorting** - Sort results by name, category, size, or date
- [ ] **Terminal markdown rendering** - Render `.md` file content with formatting in the terminal pager
- [ ] **One-click "Update All"** - Single command to update all downloaded items that have newer versions
- [ ] **Non-interactive JSON output** - `--json` flag for scriptable and pipeable output
- [ ] **Download history/statistics** - Track and display download analytics via a `--history` flag

## Improvements

### Major Improvements

- [ ] **Offline mode with cached data** - Allow browsing and using cached items when offline
- [ ] **Offline mode with local tools** - Allow local folders to be mapped as sources and downloaded per workspace
- [ ] **Interactive configuration wizard** - Guided setup for repositories and folder mappings as an alternative to editing JSON directly

### Minor Improvements

- [ ] **Side-by-side diff display** - Show differences when items have updates available
- [ ] **Advanced filtering** - Filter by repository, category, or file size range from the interactive terminal list
- [ ] **Progressive loading** - Display cached items immediately while fetching updates in the background
- [ ] **File info display** - Show size, modification date, and source repository for items in the terminal list
- [ ] **Smart cache invalidation** - Implement more intelligent cache refresh strategies based on source activity
