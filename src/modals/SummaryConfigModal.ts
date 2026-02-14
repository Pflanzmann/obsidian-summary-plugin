import { App, Modal, ButtonComponent, Setting, TFile, TFolder, setIcon, debounce } from "obsidian";
import { RunConfig, SummaryPluginInterface } from "../types";
import { getIncludedFiles, getIncludedFilesForFolder } from "../generator";

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
	onSubmit: (files: TFile[], config: RunConfig) => void;
	config: RunConfig;

	statsEl: HTMLElement;
	treeContainerEl: HTMLElement;
	generateBtn: ButtonComponent;

	discoveredFiles: TFile[] = [];
	treeRoot: TreeNode;
	excludedPaths: Set<string> = new Set();

	constructor(
		app: App,
		plugin: SummaryPluginInterface,
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

				const finalSelection = this.getSelectedFiles(this.treeRoot);
				this.close();
				this.onSubmit(finalSelection, this.config);
			});

		this.refreshFiles();

		setTimeout(() => {
			if (this.generateBtn && this.generateBtn.buttonEl) {
				this.generateBtn.buttonEl.focus();
			}
		}, 100);
	}

	async refreshFiles() {
		if (this.source instanceof TFile) {
			const res = getIncludedFiles(this.app, this.plugin.settings, this.source, this.config);
			this.discoveredFiles = [...res.startFiles, ...res.others];
		} else if (this.source instanceof TFolder) {
			const res = getIncludedFilesForFolder(this.app, this.plugin.settings, this.source.path, this.config);
			this.discoveredFiles = [...res.startFiles, ...res.others];
		}
		this.buildTree();
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

		const sortedFiles = this.discoveredFiles.sort((a,b) => a.path.localeCompare(b.path));

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
		this.renderNode(this.treeRoot, this.treeContainerEl);
	}

	renderNode(node: TreeNode, container: HTMLElement) {
		const children = Array.from(node.children.values()).sort((a, b) => {
			if (a.isFile === b.isFile) return a.name.localeCompare(b.name);
			return a.isFile ? 1 : -1;
		});

		for (const child of children) {
			const itemEl = container.createEl("div", { cls: "vs-tree-item" });
			if (node === this.treeRoot) {
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
			rowEl.createEl("span", { cls: "vs-tree-label", text: child.name });

			rowEl.onclick = (e) => {
				if (e.target !== checkbox && e.target !== collapseIcon) {
					this.toggleNode(child, !child.checked);
				}
			};

			if (!child.isFile && !child.collapsed) {
				const childContainer = itemEl.createEl("div");
				this.renderNode(child, childContainer);
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
