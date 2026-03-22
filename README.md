# Vault Summary for Obsidian

**Vault Summary** is a powerful Obsidian plugin that allows you to compile multiple Markdown files—or your entire vault—into a single, well-structured text document.

It traverses your note graph (outgoing links and incoming backlinks), allows you to precisely select which files to include via an interactive tree view, and outputs a clean, concatenated file.

**Primary Use Case:** This is the perfect tool for generating context files to feed into Large Language Models (LLMs) like ChatGPT, Claude, or local models. It gathers your interconnected thoughts and packages them into a format AI can easily parse.

## ✨ Features

- **Flexible Starting Points:** Generate summaries starting from a single active file, a specific folder, multiple selected files, or your entire vault.
- **Graph Traversal:** Automatically find and include related notes. Configure how deep the plugin should search (Search Depth 1-5) and whether to include Outgoing Links (Mentions) and/or Incoming Links (Backlinks).
- **Interactive Configuration Modal:** Before generating the summary, view a clean Tree UI showing exactly which "Root Files" and "Linked Files" will be included. Check/uncheck individual files or entire folders.
- **Manual Additions:** Forgot a file? Add specific files or folders to your generation queue directly from the modal.
- **Smart History:** The plugin remembers your recently summarized files and folders (marked with a 🕒) for quick access.
- **Advanced Mirror Mode:** Maintain a public/private workflow? The plugin can pair your primary notes with their "Mirror" (e.g., a public folder) equivalents, sorting them together and clearly labeling their source.
- **Robust Exclusions:** Skip template folders, archive directories, specific files, or use Globs to keep your summaries clean of unwanted metadata.

## 🚀 How to Use

### Commands
You can access Vault Summary via the Command Palette (`Ctrl/Cmd + P`) or by right-clicking files/folders in the file explorer.

- **Generate summary: Active file**: Starts a summary based on the file you are currently reading.
- **Generate summary: Choose file/folder...**: Opens a fuzzy-search modal to pick a starting point.
- **Generate summary: Entire vault**: Compiles the whole vault (excluding your defined ignore lists).
- **Context Menu:** Right-click any file, folder, or multiple selected items and choose **Generate summary**.

### The Output Format
The generated output file (default: `Vault Summary.txt`) formats your notes cleanly, ensuring boundaries between files are clear. It dynamically appends the source name (e.g., `Vault Summary - MyProject.txt`).

Notice how the plugin automatically pulls in the linked `Related Idea` file because it was referenced in the starting file:

`````text
### FILE: Projects/MyProject.md

````markdown
# My Project
This is the core project file. We are building the new architecture based on the concepts outlined in [[Related Idea]]. 
````

### FILE: Concepts/Related Idea.md

````markdown
# Related Idea
This concept explains the underlying mechanics of the architecture. 
````
`````

## 🌳 The Interactive Modal

When you trigger a summary (except for "Entire Vault"), an interactive modal appears:
1. **Adjust Graph Settings:** Toggle Backlinks/Mentions and adjust the depth slider on the fly. The file list recalculates instantly.
2. **Review Files:** Files are split into **Root Files** (your starting points) and **Linked Files** (discovered via traversal).
3. **Refine:** Uncheck any files or folders you don't want to include.
4. **Add More:** Use the `+` icons to manually inject extra files or folders into the compilation.

## 🪞 Mirror Mode (Advanced)

If you maintain a workflow where you have a "Private" note and a "Public/Published" version of the same note inside a specific folder (e.g., `PublicMirror/`), you can enable **Mirror Mode** in the settings.

When enabled:
- Selecting a file will automatically pull in its mirrored counterpart.
- In the final output, the files are sorted next to each other.
- Custom labels are injected (e.g., `> Source: PRIMARY` and `> Source: MIRROR`) so you (or an AI) can easily compare the two versions.

## ⚙️ Settings

Go to `Settings > Vault Summary` to configure the plugin:

- **Base Output Path:** Where the summary file should be saved.
- **Persistent Inclusions:** Always include specific root or linked files in every generated summary (great for always including a "System Prompt" or "Vault Index" note).
- **Graph Traversal Defaults:** Set whether backlinks are checked for the entire graph, or *only* for your starting root files.
- **Mirror Mode:** Enable/disable and define your mirror folder path and labels.
- **Exclusions:** Define global directories (e.g., `Templates`, `Meta`), specific file paths, or glob patterns to permanently ignore during generation.

## 📦 Installation

**Manual Installation:**
1. Download the `main.js`, `manifest.json`, and `styles.css` (if compiled) from the latest Release.
2. Place them inside your vault in `.obsidian/plugins/vault-summary/`.
3. Restart Obsidian and enable the plugin in `Settings > Community Plugins`.

**Using BRAT (Beta Reviewers Auto-update Tool):**
1. Install the BRAT plugin from the Community Plugins list.
2. Add the GitHub repository URL of this plugin to BRAT.
3. Enable the plugin in your Obsidian settings.
