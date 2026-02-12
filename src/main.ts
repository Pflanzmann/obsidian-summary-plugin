import { App, Notice, Plugin, FuzzySuggestModal, TFolder, TFile, Modal, Setting, debounce, ButtonComponent, setIcon } from "obsidian";
import { VaultSummarySettings, RunConfig } from "./types";
import { DEFAULT_SETTINGS, SummarySettingTab } from "./settings";
import {
	generateSummary,
	generateSummaryFromFiles,
	getIncludedFiles,
	getIncludedFilesForFolder
} from "./generator";

export default class VaultSummaryPlugin extends Plugin {
	settings: VaultSummarySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new SummarySettingTab(this.app, this));
		this.loadStyles();

		// 1. Entire Vault
		this.addCommand({
			id: "generate-vault-summary",
			name: "Generate summary: Entire vault",
			callback: async () => {
				try {
					await generateSummary(this.app, this.settings);
				} catch (err: any) {
					console.error(err);
					new Notice(`Failed: ${err?.message ?? String(err)}`);
				}
			},
		});

		// 2. Folder Mode
		this.addCommand({
			id: "generate-vault-summary-from-links",
			name: "Generate summary: Choose folder...",
			callback: async () => {
				new FolderSuggestModal(this.app, this.settings, (selectedFolder) => {
					new SummaryConfigModal(this.app, this, selectedFolder, async (files, config) => {
						await this.addFolderToHistory(selectedFolder.path);
						try {
							const folderName = selectedFolder.path.split('/').pop() || "Folder";
							await generateSummaryFromFiles(this.app, this.settings, files, folderName);
						} catch (err: any) {
							console.error(err);
							new Notice(`Failed: ${err?.message ?? String(err)}`);
						}
					}).open();
				}).open();
			},
		});

		// 3. Single File Mode (File Picker)
		this.addCommand({
			id: "generate-vault-summary-single-file",
			name: "Generate summary: Choose file...",
			callback: async () => {
				new FileSuggestModal(this.app, this.settings, (file) => {
					new SummaryConfigModal(this.app, this, file, async (files, config) => {
						await this.addFileToHistory(file.path);
						try {
							await generateSummaryFromFiles(this.app, this.settings, files, file.basename);
						} catch (err: any) {
							console.error(err);
							new Notice(`Failed: ${err?.message ?? String(err)}`);
						}
					}).open();
				}).open();
			},
		});

		// 4. Current File Mode (Active View)
		this.addCommand({
			id: "generate-vault-summary-current-file",
			name: "Generate summary: Active file",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile instanceof TFile && activeFile.extension === "md") {
					if (!checking) {
						new SummaryConfigModal(this.app, this, activeFile, async (files, config) => {
							await this.addFileToHistory(activeFile.path);
							try {
								await generateSummaryFromFiles(this.app, this.settings, files, activeFile.basename);
							} catch (err: any) {
								console.error(err);
								new Notice(`Failed: ${err?.message ?? String(err)}`);
							}
						}).open();
					}
					return true;
				}
				return false;
			},
		});
	}

	loadStyles() {
		// Injecting minimal styles for the Tree View
		const styleId = "vault-summary-tree-styles";
		if (document.getElementById(styleId)) return;

		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			.vs-tree-container {
				border: 1px solid var(--background-modifier-border);
				background-color: var(--background-primary);
				padding: 10px;
				border-radius: 4px;
				max-height: 400px;
				overflow-y: auto;
				margin-bottom: 20px;
			}
			.vs-tree-item {
				display: flex;
				flex-direction: column;
				margin-left: 18px; /* Indent */
				border-left: 1px solid var(--background-modifier-border);
			}
			.vs-tree-row {
				display: flex;
				align-items: center;
				padding: 2px 0;
				cursor: pointer;
			}
			.vs-tree-row:hover {
				background-color: var(--background-modifier-hover);
			}
			.vs-tree-row input[type="checkbox"] {
				margin-right: 6px;
				cursor: pointer;
			}
			.vs-tree-row .vs-icon {
				margin-right: 4px;
				color: var(--text-muted);
				display: flex;
				align-items: center;
			}
			.vs-tree-label {
				font-size: 0.9em;
				color: var(--text-normal);
			}
			.vs-tree-row.is-folder {
				font-weight: 600;
			}
			.vs-collapse-icon {
				width: 16px;
				height: 16px;
				margin-right: 4px;
				transform: rotate(0deg);
				transition: transform 0.1s ease;
				cursor: pointer;
				opacity: 0.7;
			}
			.vs-collapse-icon.is-collapsed {
				transform: rotate(-90deg);
			}
			.vs-stats-bar {
				display: flex;
				justify-content: space-between;
				font-size: 0.8em;
				color: var(--text-muted);
				margin-bottom: 5px;
				padding: 0 5px;
			}
		`;
		document.head.appendChild(style);
	}

	async addFolderToHistory(path: string) {
		let recents = this.settings.recentFolders.filter(p => p !== path);
		recents.unshift(path);
		if (recents.length > 5) recents = recents.slice(0, 5);
		this.settings.recentFolders = recents;
		await this.saveSettings();
	}

	async addFileToHistory(path: string) {
		let recents = this.settings.recentFiles.filter(p => p !== path);
		recents.unshift(path);
		if (recents.length > 5) recents = recents.slice(0, 5);
		this.settings.recentFiles = recents;
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// --- TREE VIEW TYPES ---

interface TreeNode {
	name: string;
	path: string; // The full path
	isFile: boolean;
	file?: TFile;
	children: Map<string, TreeNode>;
	checked: boolean;
	collapsed: boolean;
	parent?: TreeNode;
}

/**
 * Enhanced Modal with File Tree Selection
 */
class SummaryConfigModal extends Modal {
	plugin: VaultSummaryPlugin;
	source: TFile | TFolder;
	onSubmit: (files: TFile[], config: RunConfig) => void;
	config: RunConfig;

	// UI Elements
	statsEl: HTMLElement;
	treeContainerEl: HTMLElement;
	generateBtn: ButtonComponent;

	// State
	discoveredFiles: TFile[] = [];
	treeRoot: TreeNode;
	// We keep a map of manually unchecked paths to persist state during config updates
	excludedPaths: Set<string> = new Set();

	constructor(
		app: App,
		plugin: VaultSummaryPlugin,
		source: TFile | TFolder,
		onSubmit: (files: TFile[], config: RunConfig) => void
	) {
		super(app);
		this.plugin = plugin;
		this.source = source;
		this.onSubmit = onSubmit;
		this.config = { ...this.plugin.settings.lastRunSettings };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const typeLabel = this.source instanceof TFolder ? "Folder" : "File";
		const name = this.source instanceof TFile ? this.source.basename : this.source.name;

		contentEl.createEl("h2", { text: `Generate Summary (${typeLabel})` });
		contentEl.createEl("p", { text: `Source: ${name}`, cls: "setting-item-description" });

		// --- Settings Controls ---

		new Setting(contentEl)
			.setName("Include Mentions (Outgoing)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.config.includeMentions)
					.onChange((val) => {
						this.config.includeMentions = val;
						this.refreshFiles();
					})
			);

		new Setting(contentEl)
			.setName("Include Backlinks (Incoming)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.config.includeBacklinks)
					.onChange((val) => {
						this.config.includeBacklinks = val;
						this.refreshFiles();
					})
			);

		new Setting(contentEl)
			.setName("Search Depth")
			.setDesc("Levels of links to traverse.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 1)
					.setValue(this.config.depth)
					.setDynamicTooltip()
					.onChange(debounce((val) => {
						this.config.depth = val;
						this.refreshFiles();
					}, 300))
			);

		// --- Tree View Area ---

		this.statsEl = contentEl.createEl("div", { cls: "vs-stats-bar" });
		this.treeContainerEl = contentEl.createEl("div", { cls: "vs-tree-container" });
		this.treeContainerEl.setText("Calculating linked files...");

		// --- Buttons ---

		const btnDiv = contentEl.createEl("div", { cls: "modal-button-container" });

		new ButtonComponent(btnDiv)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		this.generateBtn = new ButtonComponent(btnDiv)
			.setButtonText("Generate Summary")
			.setCta()
			.onClick(async () => {
				this.plugin.settings.lastRunSettings = this.config;
				await this.plugin.saveSettings();

				const finalSelection = this.getSelectedFiles(this.treeRoot);
				this.close();
				this.onSubmit(finalSelection, this.config);
			});

		// Initial load
		this.refreshFiles();

		// Set focus to the generate button after a slight delay to ensure DOM is ready
		setTimeout(() => {
			if (this.generateBtn && this.generateBtn.buttonEl) {
				this.generateBtn.buttonEl.focus();
			}
		}, 100);
	}

	async refreshFiles() {
		// 1. Run Logic to get files based on current settings
		if (this.source instanceof TFile) {
			const res = getIncludedFiles(this.app, this.plugin.settings, this.source, this.config);
			this.discoveredFiles = [...res.startFiles, ...res.others];
		} else if (this.source instanceof TFolder) {
			const res = getIncludedFilesForFolder(this.app, this.plugin.settings, this.source.path, this.config);
			this.discoveredFiles = [...res.startFiles, ...res.others];
		}

		// 2. Build Tree Structure
		this.buildTree();

		// 3. Render
		this.renderTree();
	}

	buildTree() {
		const root: TreeNode = {
			name: "root",
			path: "",
			isFile: false,
			children: new Map(),
			checked: true,
			collapsed: false
		};

		// Helper to find/create node
		const getNode = (pathParts: string[], current: TreeNode): TreeNode => {
			if (pathParts.length === 0) return current;

			const name = pathParts[0];
			if (!name) return current;

			if (!current.children.has(name)) {
				current.children.set(name, {
					name,
					path: current.path ? `${current.path}/${name}` : name,
					isFile: false, // temporarily assume folder
					children: new Map(),
					checked: true, // default to checked
					collapsed: false,
					parent: current
				});
			}
			return getNode(pathParts.slice(1), current.children.get(name)!);
		};

		// Sort files for better tree building (folders first naturally happens if we sort by path)
		const sortedFiles = this.discoveredFiles.sort((a,b) => a.path.localeCompare(b.path));

		for (const file of sortedFiles) {
			const parts = file.path.split("/");
			const fileName = parts.pop()!;
			const folderNode = getNode(parts, root);

			// Add the file node
			const filePath = file.path;
			// If user previously unchecked this file specifically, keep it unchecked.
			// Otherwise default to true.
			const isChecked = !this.excludedPaths.has(filePath);

			folderNode.children.set(fileName, {
				name: fileName,
				path: filePath,
				isFile: true,
				file: file,
				children: new Map(), // Empty for files
				checked: isChecked,
				collapsed: false,
				parent: folderNode
			});
		}

		this.treeRoot = root;
		this.recalcFolderCheckStates(this.treeRoot);
	}

	recalcFolderCheckStates(node: TreeNode) {
		if (node.isFile) return;

		let allChecked = true;
		let hasChildren = false;

		for (const child of node.children.values()) {
			hasChildren = true;
			this.recalcFolderCheckStates(child);
			if (!child.checked) allChecked = false;
		}

		// If it's a folder, its checked state reflects "All children selected"
		// Logic: If I uncheck one child, the folder unchecks visually (to allow re-checking all)
		if (hasChildren) {
			node.checked = allChecked;
		}
	}

	renderTree() {
		this.treeContainerEl.empty();
		const total = this.discoveredFiles.length;
		const selected = this.getSelectedCount(this.treeRoot);

		this.statsEl.setText(`${selected} / ${total} selected`);
		this.generateBtn.setDisabled(selected === 0);

		// Recursively render
		this.renderNode(this.treeRoot, this.treeContainerEl);
	}

	renderNode(node: TreeNode, container: HTMLElement) {
		// Sort children: Folders first, then files
		const children = Array.from(node.children.values()).sort((a, b) => {
			if (a.isFile === b.isFile) return a.name.localeCompare(b.name);
			return a.isFile ? 1 : -1;
		});

		for (const child of children) {
			const itemEl = container.createEl("div", { cls: "vs-tree-item" });

			// If root, remove left border/margin for cleaner look
			if (node === this.treeRoot) {
				itemEl.style.marginLeft = "0";
				itemEl.style.borderLeft = "none";
			}

			// Row (Checkbox + Icon + Name)
			const rowEl = itemEl.createEl("div", {
				cls: `vs-tree-row ${!child.isFile ? 'is-folder' : ''}`
			});

			// Collapse Icon (Folders only)
			const collapseIcon = rowEl.createEl("div", { cls: "vs-collapse-icon" });
			if (!child.isFile) {
				setIcon(collapseIcon, "chevron-down");
				if (child.collapsed) collapseIcon.addClass("is-collapsed");

				collapseIcon.onclick = (e) => {
					e.stopPropagation();
					child.collapsed = !child.collapsed;
					this.renderTree(); // Re-render to show/hide children
				};
			}

			// Checkbox
			const checkbox = rowEl.createEl("input", { type: "checkbox" });
			checkbox.checked = child.checked;
			checkbox.onclick = (e) => {
				e.stopPropagation();
				this.toggleNode(child, checkbox.checked);
			};

			// File/Folder Icon
			const iconEl = rowEl.createEl("span", { cls: "vs-icon" });
			setIcon(iconEl, child.isFile ? "file-text" : "folder");

			// Label
			rowEl.createEl("span", { cls: "vs-tree-label", text: child.name });

			// Row Click (toggle checkbox)
			rowEl.onclick = (e) => {
				// Prevent double toggle if clicking the checkbox directly (handled above)
				if (e.target !== checkbox && e.target !== collapseIcon) {
					this.toggleNode(child, !child.checked);
				}
			};

			// Children Container
			if (!child.isFile && !child.collapsed) {
				const childContainer = itemEl.createEl("div");
				this.renderNode(child, childContainer);
			}
		}
	}

	toggleNode(node: TreeNode, state: boolean) {
		node.checked = state;

		// 1. Propagate down (select all children)
		const propagateDown = (n: TreeNode, s: boolean) => {
			n.checked = s;
			if (n.isFile) {
				if (s) this.excludedPaths.delete(n.path);
				else this.excludedPaths.add(n.path);
			}
			for (const c of n.children.values()) propagateDown(c, s);
		};
		propagateDown(node, state);

		// 2. Propagate up (update parent folder status)
		// We don't necessarily check parents, but we might uncheck them if a child is unchecked
		let curr = node.parent;
		while (curr && curr !== this.treeRoot) {
			let allChildrenChecked = true;
			for (const c of curr.children.values()) {
				if (!c.checked) {
					allChildrenChecked = false;
					break;
				}
			}
			curr.checked = allChildrenChecked;
			curr = curr.parent;
		}

		this.renderTree();
	}

	getSelectedCount(node: TreeNode): number {
		let count = 0;
		if (node.isFile && node.checked) count++;
		for (const child of node.children.values()) {
			count += this.getSelectedCount(child);
		}
		return count;
	}

	getSelectedFiles(node: TreeNode): TFile[] {
		let files: TFile[] = [];
		if (node.isFile && node.checked && node.file) {
			files.push(node.file);
		}
		for (const child of node.children.values()) {
			files = files.concat(this.getSelectedFiles(child));
		}
		return files;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * File Suggest Modal (Unchanged essentially, included for context)
 */
class FileSuggestModal extends FuzzySuggestModal<TFile> {
	settings: VaultSummarySettings;
	onChoose: (file: TFile) => void;

	constructor(app: App, settings: VaultSummarySettings, onChoose: (file: TFile) => void) {
		super(app);
		this.settings = settings;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a starting file (🕒 = Recent)...");
	}

	getItems(): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();
		const history = this.settings.recentFiles;

		return allFiles.sort((a, b) => {
			const idxA = history.indexOf(a.path);
			const idxB = history.indexOf(b.path);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.path.localeCompare(b.path);
		});
	}

	getItemText(file: TFile): string {
		const isRecent = this.settings.recentFiles.includes(file.path);
		return isRecent ? `🕒 ${file.path}` : file.path;
	}

	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(file);
	}
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	settings: VaultSummarySettings;
	onChoose: (folder: TFolder) => void;

	constructor(app: App, settings: VaultSummarySettings, onChoose: (folder: TFolder) => void) {
		super(app);
		this.settings = settings;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a folder to scan (🕒 = Recent)");
	}

	getItems(): TFolder[] {
		const allFolders = this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder);
		const history = this.settings.recentFolders;

		return allFolders.sort((a, b) => {
			const idxA = history.indexOf(a.path);
			const idxB = history.indexOf(b.path);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.path.localeCompare(b.path);
		});
	}

	getItemText(folder: TFolder): string {
		const isRecent = this.settings.recentFolders.includes(folder.path);
		return isRecent ? `🕒 ${folder.path}` : folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(folder);
	}
}
