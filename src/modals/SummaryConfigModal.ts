import { App, Modal, ButtonComponent, Setting, TFile, TFolder, setIcon, debounce, Notice } from "obsidian";
import { RunConfig, SummaryPluginInterface } from "../types";
import { runBFS } from "../generator/graph";
import { resolveStartFiles, expandWithMirrors } from "../generator/mirror";
import { FileSuggestModal, FolderSuggestModal } from "./SuggestModals";
import { isExcludedFilePath, isFolderExcluded } from "../utils";

interface TreeNode {
	name: string;
	path: string;
	isFile: boolean;
	file?: TFile;
	children: Map<string, TreeNode>;
	checked: boolean;
	collapsed: boolean;
	parent?: TreeNode;
}

export class SummaryConfigModal extends Modal {
	plugin: SummaryPluginInterface;
	source: TFile | TFolder;
	onSubmit: (files: TFile[], config: RunConfig, rootFiles: TFile[]) => void;
	config: RunConfig;

	statsEl: HTMLElement;
	treeContainerEl: HTMLElement;
	generateBtn: ButtonComponent;

	startFiles: TFile[] = [];
	linkedFiles: TFile[] = [];

	manuallyAddedFiles: TFile[] = [];
	manuallyAddedLinkedFiles: TFile[] = [];
	removedAutoRoots: Set<string> = new Set();

	rootsTree: TreeNode;
	linkedTree: TreeNode;

	excludedPaths: Set<string> = new Set();

	constructor(
		app: App,
		plugin: SummaryPluginInterface,
		source: TFile | TFolder,
		onSubmit: (files: TFile[], config: RunConfig, rootFiles: TFile[]) => void
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

		this.statsEl = contentEl.createEl("div", { cls: "vs-stats-bar" });
		this.treeContainerEl = contentEl.createEl("div", { cls: "vs-tree-container" });
		this.treeContainerEl.setText("Calculating linked files...");

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

				const rootsSelection = this.getSelectedFiles(this.rootsTree);
				const linkedSelection = this.getSelectedFiles(this.linkedTree);

				const allPaths = new Set<string>();
				const finalSelection: TFile[] = [];

				[...rootsSelection, ...linkedSelection].forEach(f => {
					if (!allPaths.has(f.path)) {
						allPaths.add(f.path);
						finalSelection.push(f);
					}
				});

				this.close();
				this.onSubmit(finalSelection, this.config, rootsSelection);
			});

		// Calculate files, render tree, then focus the button
		this.refreshFiles().then(() => {
			this.generateBtn.buttonEl.focus();
		});
	}

	async refreshFiles() {
		// 1. Determine Base Roots
		let initialRoots: TFile[] = [];

		if (this.source instanceof TFile) {
			initialRoots = resolveStartFiles(this.app, this.plugin.settings, this.source);
		} else {
			const folderPath = this.source.path;
			initialRoots = this.app.vault.getMarkdownFiles().filter(f =>
				f.path === folderPath || f.path.startsWith(folderPath + "/")
			);
		}

		// 2. Add Manually Added Files
		for (const manual of this.manuallyAddedFiles) {
			const resolved = resolveStartFiles(this.app, this.plugin.settings, manual);
			initialRoots.push(...resolved);
		}

		// 3. Deduplicate
		const uniqueMap = new Map<string, TFile>();
		initialRoots.forEach(f => uniqueMap.set(f.path, f));

		// 4. Remove Deleted Auto-Roots
		this.removedAutoRoots.forEach(path => uniqueMap.delete(path));

		const effectiveRoots = Array.from(uniqueMap.values());

		// 5. Run BFS (Passing plugin settings for global backlink control)
		const bfsResult = runBFS(this.app, effectiveRoots, this.config, this.plugin.settings);

		// 6. Expand Mirrors & Filter
		// Roots are NOT filtered by exclusion (explicit inclusion)
		this.startFiles = expandWithMirrors(this.app, this.plugin.settings, bfsResult.startFiles);

		// Initialize linked files
		let rawLinked = expandWithMirrors(this.app, this.plugin.settings, bfsResult.others);

		// Process manually added linked files
		const manualLinkedExpanded = new Set<string>();
		for (const manual of this.manuallyAddedLinkedFiles) {
			const resolved = resolveStartFiles(this.app, this.plugin.settings, manual);
			const expanded = expandWithMirrors(this.app, this.plugin.settings, resolved);
			for (const f of expanded) {
				manualLinkedExpanded.add(f.path);
				rawLinked.push(f);
			}
		}

		// Deduplicate and filter out files that are already part of startFiles
		const startPaths = new Set(this.startFiles.map(f => f.path));
		const uniqueLinked = new Map<string, TFile>();

		for (const f of rawLinked) {
			if (!startPaths.has(f.path)) {
				uniqueLinked.set(f.path, f);
			}
		}

		this.linkedFiles = Array.from(uniqueLinked.values()).filter(f => {
			// Bypass exclusions for manually added linked files
			if (manualLinkedExpanded.has(f.path)) return true;

			if (isExcludedFilePath(f.path, this.plugin.settings)) return false;
			if (isFolderExcluded(f.path, this.plugin.settings)) return false;
			return true;
		});

		// 7. Rebuild UI
		this.buildTrees();
		this.renderTree();
	}

	buildTrees() {
		this.rootsTree = this.buildSingleTreeStructure(this.startFiles);
		this.linkedTree = this.buildSingleTreeStructure(this.linkedFiles);
	}

	buildSingleTreeStructure(files: TFile[]): TreeNode {
		const root: TreeNode = {
			name: "root",
			path: "",
			isFile: false,
			children: new Map(),
			checked: true,
			collapsed: false
		};

		const getNode = (pathParts: string[], current: TreeNode): TreeNode => {
			if (pathParts.length === 0) return current;
			const name = pathParts[0];
			if (!name) return current;

			if (!current.children.has(name)) {
				current.children.set(name, {
					name,
					path: current.path ? `${current.path}/${name}` : name,
					isFile: false,
					children: new Map(),
					checked: true,
					collapsed: false,
					parent: current
				});
			}
			return getNode(pathParts.slice(1), current.children.get(name)!);
		};

		const sortedFiles = files.sort((a,b) => a.path.localeCompare(b.path));

		for (const file of sortedFiles) {
			const parts = file.path.split("/");
			const fileName = parts.pop()!;
			const folderNode = getNode(parts, root);
			const filePath = file.path;
			const isChecked = !this.excludedPaths.has(filePath);

			folderNode.children.set(fileName, {
				name: fileName,
				path: filePath,
				isFile: true,
				file: file,
				children: new Map(),
				checked: isChecked,
				collapsed: false,
				parent: folderNode
			});
		}

		this.recalcFolderCheckStates(root);
		return root;
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
		if (hasChildren) {
			node.checked = allChecked;
		}
	}

	renderTree() {
		this.treeContainerEl.empty();

		const rootsCount = this.startFiles.length;
		const linkedCount = this.linkedFiles.length;
		const rootsSelected = this.getSelectedCount(this.rootsTree);
		const linkedSelected = this.getSelectedCount(this.linkedTree);
		const totalSelected = rootsSelected + linkedSelected;

		this.statsEl.setText(`${totalSelected} / ${rootsCount + linkedCount} selected`);
		this.generateBtn.setDisabled(totalSelected === 0);

		// --- Roots Section ---
		const rootSection = this.treeContainerEl.createEl("div", { cls: "vs-tree-section" });

		const headerRow = rootSection.createEl("div", { cls: "vs-tree-section-header-row" });
		headerRow.createEl("span", { text: `Root Files`, cls: "vs-tree-section-header" });

		const actionsDiv = headerRow.createEl("div", { cls: "vs-tree-actions" });

		const addFileBtn = actionsDiv.createEl("button", { cls: "vs-icon-btn", attr: { "aria-label": "Add File" } });
		setIcon(addFileBtn, "file-plus");
		addFileBtn.onclick = () => this.addFile();

		const addFolderBtn = actionsDiv.createEl("button", { cls: "vs-icon-btn", attr: { "aria-label": "Add Folder" } });
		setIcon(addFolderBtn, "folder-plus");
		addFolderBtn.onclick = () => this.addFolder();

		if (rootsCount > 0) {
			this.renderNode(this.rootsTree, rootSection, true);
		} else {
			const emptyMsg = rootSection.createEl("div", { cls: "vs-tree-empty-msg" });
			emptyMsg.setText("No root files selected.");
		}

		// --- Linked Section ---
		const showLinkedSection = linkedCount > 0 || rootsCount > 0 || this.manuallyAddedLinkedFiles.length > 0;

		if (showLinkedSection) {
			// Draw separator if there's a section above it
			if (rootsCount > 0) {
				this.treeContainerEl.createEl("div", { cls: "vs-tree-separator" });
			}

			const linkedSection = this.treeContainerEl.createEl("div", { cls: "vs-tree-section" });

			const linkedHeaderRow = linkedSection.createEl("div", { cls: "vs-tree-section-header-row" });
			linkedHeaderRow.createEl("span", {
				text: `Linked Files (${linkedCount})`,
				cls: "vs-tree-section-header"
			});

			const linkedActionsDiv = linkedHeaderRow.createEl("div", { cls: "vs-tree-actions" });

			const addLinkedFileBtn = linkedActionsDiv.createEl("button", { cls: "vs-icon-btn", attr: { "aria-label": "Add File" } });
			setIcon(addLinkedFileBtn, "file-plus");
			addLinkedFileBtn.onclick = () => this.addLinkedFile();

			const addLinkedFolderBtn = linkedActionsDiv.createEl("button", { cls: "vs-icon-btn", attr: { "aria-label": "Add Folder" } });
			setIcon(addLinkedFolderBtn, "folder-plus");
			addLinkedFolderBtn.onclick = () => this.addLinkedFolder();

			if (linkedCount > 0) {
				this.renderNode(this.linkedTree, linkedSection, false);
			} else {
				const emptyMsg = linkedSection.createEl("div", { cls: "vs-tree-empty-msg" });
				emptyMsg.setText("No additional links found.");
			}
		}
	}

	addFile() {
		new FileSuggestModal(this.app, this.plugin.settings, this.plugin.history, (file) => {
			const resolvedFiles = resolveStartFiles(this.app, this.plugin.settings, file);
			let addedCount = 0;
			for (const f of resolvedFiles) {
				if (this.removedAutoRoots.has(f.path)) this.removedAutoRoots.delete(f.path);
				if (!this.manuallyAddedFiles.some(existing => existing.path === f.path)) {
					this.manuallyAddedFiles.push(f);
					addedCount++;
				}
			}
			this.refreshFiles();
			if (addedCount > 1) new Notice(`Added ${addedCount} files (Primary + Mirror).`);
		}).open();
	}

	addFolder() {
		new FolderSuggestModal(this.app, this.plugin.settings, this.plugin.history, (folder) => {
			const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder.path + "/"));
			let count = 0;
			files.forEach(file => {
				const resolvedFiles = resolveStartFiles(this.app, this.plugin.settings, file);
				for (const f of resolvedFiles) {
					if (this.removedAutoRoots.has(f.path)) this.removedAutoRoots.delete(f.path);
					if (!this.manuallyAddedFiles.some(mf => mf.path === f.path)) {
						this.manuallyAddedFiles.push(f);
						count++;
					}
				}
			});
			if (count > 0) {
				new Notice(`Added ${count} files from folder.`);
				this.refreshFiles();
			} else {
				new Notice("All files in folder already added.");
			}
		}).open();
	}

	removeFile(file: TFile) {
		this.manuallyAddedFiles = this.manuallyAddedFiles.filter(f => f.path !== file.path);
		this.removedAutoRoots.add(file.path);
		this.excludedPaths.delete(file.path);
		this.refreshFiles();
	}

	addLinkedFile() {
		new FileSuggestModal(this.app, this.plugin.settings, this.plugin.history, (file) => {
			const resolvedFiles = resolveStartFiles(this.app, this.plugin.settings, file);
			let addedCount = 0;
			for (const f of resolvedFiles) {
				this.excludedPaths.delete(f.path);
				if (!this.manuallyAddedLinkedFiles.some(existing => existing.path === f.path)) {
					this.manuallyAddedLinkedFiles.push(f);
					addedCount++;
				}
			}
			this.refreshFiles();
			if (addedCount > 1) new Notice(`Added ${addedCount} files (Primary + Mirror) to Linked Files.`);
		}).open();
	}

	addLinkedFolder() {
		new FolderSuggestModal(this.app, this.plugin.settings, this.plugin.history, (folder) => {
			const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder.path + "/"));
			let count = 0;
			files.forEach(file => {
				const resolvedFiles = resolveStartFiles(this.app, this.plugin.settings, file);
				for (const f of resolvedFiles) {
					this.excludedPaths.delete(f.path);
					if (!this.manuallyAddedLinkedFiles.some(mf => mf.path === f.path)) {
						this.manuallyAddedLinkedFiles.push(f);
						count++;
					}
				}
			});
			if (count > 0) {
				new Notice(`Added ${count} files from folder to Linked Files.`);
				this.refreshFiles();
			} else {
				new Notice("All files in folder already added.");
			}
		}).open();
	}

	removeLinkedFile(file: TFile) {
		this.manuallyAddedLinkedFiles = this.manuallyAddedLinkedFiles.filter(f => f.path !== file.path);
		this.excludedPaths.delete(file.path);
		this.refreshFiles();
	}

	renderNode(node: TreeNode, container: HTMLElement, isRootTree: boolean) {
		const children = Array.from(node.children.values()).sort((a, b) => {
			if (a.isFile === b.isFile) return a.name.localeCompare(b.name);
			return a.isFile ? 1 : -1;
		});

		for (const child of children) {
			const itemEl = container.createEl("div", { cls: "vs-tree-item" });
			if (node.path === "") {
				itemEl.style.marginLeft = "0";
				itemEl.style.borderLeft = "none";
			}

			const rowEl = itemEl.createEl("div", {
				cls: `vs-tree-row ${!child.isFile ? 'is-folder' : ''}`
			});

			const collapseIcon = rowEl.createEl("div", { cls: "vs-collapse-icon" });
			if (!child.isFile) {
				setIcon(collapseIcon, "chevron-down");
				if (child.collapsed) collapseIcon.addClass("is-collapsed");
				collapseIcon.onclick = (e) => {
					e.stopPropagation();
					child.collapsed = !child.collapsed;
					this.renderTree();
				};
			}

			const checkbox = rowEl.createEl("input", { type: "checkbox" });
			checkbox.checked = child.checked;
			checkbox.onclick = (e) => {
				e.stopPropagation();
				this.toggleNode(child, checkbox.checked);
			};

			const iconEl = rowEl.createEl("span", { cls: "vs-icon" });
			setIcon(iconEl, child.isFile ? "file-text" : "folder");

			const labelEl = rowEl.createEl("span", { cls: "vs-tree-label", text: child.name });

			const isManualLinked = !isRootTree && child.isFile && child.file && this.manuallyAddedLinkedFiles.some(f => f.path === child.file!.path);

			// Show a trash button on root files or manually added linked files
			if ((isRootTree || isManualLinked) && child.isFile && child.file) {
				const trashBtn = rowEl.createEl("div", { cls: "vs-node-action" });
				setIcon(trashBtn, "trash-2");
				trashBtn.title = isRootTree ? "Remove from Root Files" : "Remove from Linked Files";
				trashBtn.onclick = (e) => {
					e.stopPropagation();
					if (child.file) {
						if (isRootTree) {
							this.removeFile(child.file);
						} else {
							this.removeLinkedFile(child.file);
						}
					}
				};
			}

			rowEl.onclick = (e) => {
				if (e.target instanceof HTMLElement &&
					(e.target === checkbox || e.target.closest('.vs-collapse-icon') || e.target.closest('.vs-node-action'))) {
					return;
				}
				this.toggleNode(child, !child.checked);
			};

			if (!child.isFile && !child.collapsed) {
				const childContainer = itemEl.createEl("div");
				this.renderNode(child, childContainer, isRootTree);
			}
		}
	}

	toggleNode(node: TreeNode, state: boolean) {
		node.checked = state;
		const propagateDown = (n: TreeNode, s: boolean) => {
			n.checked = s;
			if (n.isFile) {
				if (s) this.excludedPaths.delete(n.path);
				else this.excludedPaths.add(n.path);
			}
			for (const c of n.children.values()) propagateDown(c, s);
		};
		propagateDown(node, state);

		let curr = node.parent;
		while (curr) {
			let allChildrenChecked = true;
			for (const c of curr.children.values()) {
				if (!c.checked) {
					allChildrenChecked = false;
					break;
				}
			}
			curr.checked = allChildrenChecked;
			if (curr.path === "") break;
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
