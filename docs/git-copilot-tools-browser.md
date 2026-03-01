# Feature Specification: Git Copilot Tools Browser

## Overview

A command-line tool that provides an interactive terminal list to browse, preview, and download GitHub Copilot customizations (agents, instructions, plugins, prompts, skills, and workflows) from configurable GitHub repositories. Users can filter items by filename, and selectively download files to their current directory with proper GitHub Copilot folder structure. Repositories with non-standard folder layouts can be configured through custom folder-to-category mappings.

## User Journey

1. **Run Command**: User runs `cmd-copilot-tools` in their terminal
2. **Browse Categories**: User sees six category sections: Agents, Instructions, Plugins, Prompts, Skills, and Workflows
3. **Search Content**: User types `/` then a query to filter items across all categories by filename in real-time
4. **Select Category**: User types a category label (e.g., `all`, `a`, `p`) to expand the list
5. **Select for Download**: User types the item code (e.g., `a1`, `p2`) to download
6. **File Downloaded**: Item is saved to appropriate `.github/` folder structure in current directory

## Functional Requirements

1. **FR-01**: Terminal List Integration
   - **Description**: Display an interactive terminal list titled "Git Copilot Tools"
   - **Acceptance Criteria**:
     - [x] Terminal list shows six main categories: Agents, Instructions, Plugins, Prompts, Skills, and Workflows
     - [x] Each category has a character label prefix: [a], [i], [pl], [p], [s], [w]
     - [x] Each tool is prefixed with a digit for selection
     - [x] List supports `less`-like keyboard navigation (arrows, PgUp/PgDown)

2. **FR-02**: Repository Data Fetching
   - **Description**: Fetch file listings from configurable GitHub repositories
   - **Acceptance Criteria**:
     - [x] Tool fetches files from agents/, instructions/, plugins/, prompts/, skills/, and workflows/ folders
     - [x] Data is cached locally for performance
     - [x] Graceful error handling for network failures
     - [x] Support for multiple repository sources
     - [x] Support for GitHub Enterprise with custom tokens

3. **FR-03**: File Search
   - **Description**: Search mode to filter files across all categories by filename
   - **Acceptance Criteria**:
     - [x] Press `/` to enter search mode
     - [x] Typing filters files in real-time based on filename match across all categories
     - [x] Search is case-insensitive
     - [x] Press Esc to clear search and return to full list
     - [x] Search results maintain category structure
     - [x] Category-specific search with `a:term`, `pl:term` syntax

4. **FR-04**: Content Preview
   - **Description**: Display tool details when selected
   - **Acceptance Criteria**:
     - [x] Filename and category shown for each tool item
     - [x] Download feedback shows local path after successful download

5. **FR-05**: Download Functionality
   - **Description**: Download selected files to appropriate `.github/` folders
   - **Acceptance Criteria**:
     - [x] Plugins save to `.github/plugins/`
     - [x] Instructions save to `.github/instructions/`
     - [x] Prompts save to `.github/prompts/`
     - [x] Agents save to `.github/agents/`
     - [x] Skills save to `.github/skills/`
     - [x] Workflows save to `.github/workflows/`
     - [x] Creates folders if they don't exist

6. **FR-06**: Direct Download via CLI Flags
   - **Description**: Download tools directly without interactive mode
   - **Acceptance Criteria**:
     - [x] `--agent name` downloads specific agent by name
     - [x] `--prompt name1,name2` downloads multiple prompts
     - [x] Extension suffix optional (e.g., `my-prompt` matches `my-prompt.prompt.md`)
     - [x] Custom error when named tool not found

7. **FR-07**: Status and Feedback
   - **Description**: Provide user feedback during operations
   - **Acceptance Criteria**:
     - [x] Loading indicator while fetching repository data
     - [x] Success notification after successful download showing local path
     - [x] Error messages for failed operations
     - [x] Custom errors for not-found tools, invalid URLs, missing sources

8. **FR-08**: Custom Folder Mappings
   - **Description**: Configure custom folder-to-category mappings for repositories with non-standard layouts
   - **Acceptance Criteria**:
     - [x] When adding a repo with no standard folders, tool shows available directories
     - [x] Shows config file path for manual `folderMappings` configuration
     - [x] Support `root` value to treat repo root as a single category source
     - [x] Support `null` value to exclude a category
     - [x] Support custom folder paths (e.g., `src/my-prompts`)
     - [x] Mappings persisted in config file alongside repository configuration
     - [x] API queries use resolved content paths based on folder mappings
     - [x] Categories mapped to `null` return empty results without errors

## Non-Functional Requirements

- **Performance**: Initial load should complete within 10 seconds on normal internet connection
- **Reliability**: Graceful degradation when GitHub API is unavailable
- **Usability**: Interface uses familiar terminal conventions (less-like navigation, `/` for search)
- **Caching**: Repository data cached for 1 hour by default, configurable via `cacheTimeout`

## Out of Scope

- Editing downloaded files within the command-line tool
- Uploading custom files back to the repository
- Bulk download of multiple files simultaneously

## Implementation Plan

### Phase 1: Foundation & Setup

- [x] **Step 1.1**: Update package.json for command-line tool (remove VS Code, add bin entry)
- [x] **Step 1.2**: Create TypeScript interfaces for data models (`src/types.ts`)
- [x] **Step 1.3**: Set up esbuild config for CLI entry point

### Phase 2: GitHub API Engine

- [x] **Step 2.1**: Create GitHub API service to fetch repository contents (`src/engine/github.ts`)
- [x] **Step 2.2**: Implement caching mechanism for repository data (`src/engine/cache.ts`)
- [x] **Step 2.3**: Add error handling for network operations
- [x] **Step 2.4**: Create data transformation layer for tool listings

### Phase 3: Config Management

- [x] **Step 3.1**: Implement JSON-file based config management (`src/engine/config.ts`)
- [x] **Step 3.2**: Source add/remove/set-default operations
- [x] **Step 3.3**: GitHub URL parsing for `--source` flag

### Phase 4: Search & Filter

- [x] **Step 4.1**: Implement search across all categories (`src/engine/search.ts`)
- [x] **Step 4.2**: Category-specific search with prefix syntax (`a:term`, `pl:term`)
- [x] **Step 4.3**: Download code parsing (`a1`, `p2`, single digit for category view)
- [x] **Step 4.4**: Filter by category for single-category views

### Phase 5: Download Functionality

- [x] **Step 5.1**: Create download logic for file and directory types (`src/engine/download.ts`)
- [x] **Step 5.2**: Implement folder structure creation
- [x] **Step 5.3**: Handle skills and plugins (directory download)
- [x] **Step 5.4**: Batch download by name with comma-separated list support

### Phase 6: Terminal UI

- [x] **Step 6.1**: ANSI rendering helpers (`src/ui/renderer.ts`)
- [x] **Step 6.2**: Raw keyboard input handler (`src/ui/input.ts`)
- [x] **Step 6.3**: Main interactive terminal loop (`src/ui/terminal.ts`)
- [x] **Step 6.4**: Search mode with dynamic re-render
- [x] **Step 6.5**: Scroll support for long lists

### Phase 7: CLI Entry Point

- [x] **Step 7.1**: Argument parsing for all flags (`src/cli.ts`)
- [x] **Step 7.2**: Non-interactive output for piped use
- [x] **Step 7.3**: `--source`, `--use`, `--set-default`, `--remove-source`, `--list-source`
- [x] **Step 7.4**: `--search` for non-interactive search output

### Phase 8: Documentation

- [x] **Step 8.1**: Rewrite README.md for command-line tool context
- [x] **Step 8.2**: Update docs/configuration.md for JSON config file
- [x] **Step 8.3**: Update breadcrumbs from VS Code extension to command-line tool
- [x] **Step 8.4**: Update feature specification (this document)
