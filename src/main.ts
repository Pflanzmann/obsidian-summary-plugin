import { App, Notice, Plugin, FuzzySuggestModal, TFolder, TFile, Modal, Setting, debounce } from "obsidian";
import { VaultSummarySettings, RunConfig } from "./types";
import { DEFAULT_SETTINGS, SummarySettingTab } from "./settings";
import {
	generateSummary,
	generateSummaryFromLinks,
	generateSummaryFromFile,
	getPreviewCount,
	getPreviewCountForFolder
} from "./generator";

export default class VaultSummaryPlugin extends Plugin {
	settings: VaultSummarySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		this.addSettingTab(new SummarySettingTab(this.app, this));

		// 1. Entire Vault
		this.addCommand({
			id: "generate-vault-summary",
			name: "Generate summary (Entire Vault)",
			callback: async () => {
				try {
					await generateSummary(this.app, this.settings);
				} catch (err: any) {
					console.error(err);
					new Notice(`Failed: ${err?.message ?? String(err)}`);
				}
			},
		});

		// 2. Folder Mode (Updated to use Config Modal)
		this.addCommand({
			id: "generate-vault-summary-from-links",
			name: "Generate summary (Select Folder...)",
			callback: async () => {
				new FolderSuggestModal(this.app, this.settings, (selectedFolder) => {
					// Open Config Modal
					new SummaryConfigModal(this.app, this, selectedFolder, async (config) => {
						await this.addToHistory(selectedFolder.path);
						try {
							await generateSummaryFromLinks(this.app, this.settings, selectedFolder.path, config);
						} catch (err: any) {
							console.error(err);
							new Notice(`Failed: ${err?.message ?? String(err)}`);
						}
					}).open();
				}).open();
			},
		});

		// 3. Single File Mode
		this.addCommand({
			id: "generate-vault-summary-single-file",
			name: "Generate summary (Select File...)",
			callback: async () => {
				new FileSuggestModal(this.app, (file) => {
					new SummaryConfigModal(this.app, this, file, async (config) => {
						try {
							await generateSummaryFromFile(this.app, this.settings, file, config);
						} catch (err: any) {
							console.error(err);
							new Notice(`Failed: ${err?.message ?? String(err)}`);
						}
					}).open();
				}).open();
			},
		});
	}

	async addToHistory(path: string) {
		let recents = this.settings.recentFolders.filter(p => p !== path);
		recents.unshift(path);
		if (recents.length > 5) recents = recents.slice(0, 5);
		this.settings.recentFolders = recents;
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * Modal to select a single file.
 */
class FileSuggestModal extends FuzzySuggestModal<TFile> {
	onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Select a starting file...");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(file);
	}
}

/**
 * General Configuration Dialog for Summary Generation
 * Works for both Single File and Folder modes.
 */
class SummaryConfigModal extends Modal {
	plugin: VaultSummaryPlugin;
	source: TFile | TFolder;
	onSubmit: (config: RunConfig) => void;

	config: RunConfig;

	// UI Elements for updates
	previewEl: HTMLElement;

	constructor(
		app: App,
		plugin: VaultSummaryPlugin,
		source: TFile | TFolder,
		onSubmit: (config: RunConfig) => void
	) {
		super(app);
		this.plugin = plugin;
		this.source = source;
		this.onSubmit = onSubmit;
		// Reusing the same settings object for last run, or you could split them if desired
		this.config = { ...this.plugin.settings.lastRunSettings };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const typeLabel = this.source instanceof TFolder ? "Folder" : "File";
		const name = this.source instanceof TFile ? this.source.basename : this.source.name;

		contentEl.createEl("h2", { text: `Generate Summary (${typeLabel})` });
		contentEl.createEl("p", { text: `Source: ${name}`, cls: "setting-item-description" });

		// --- Preview Area ---
		this.previewEl = contentEl.createEl("div", {
			cls: "setting-item-description",
			text: "Calculating preview..."
		});
		this.previewEl.style.marginBottom = "20px";
		this.previewEl.style.fontWeight = "bold";

		// Initial Calculation
		this.updatePreview();

		new Setting(contentEl)
			.setName("Include Mentions (Outgoing)")
			.setDesc("Include files linked FROM the source(s).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.config.includeMentions)
					.onChange((val) => {
						this.config.includeMentions = val;
						this.updatePreview();
					})
			);

		new Setting(contentEl)
			.setName("Include Backlinks (Incoming)")
			.setDesc("Include files that link TO the source(s).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.config.includeBacklinks)
					.onChange((val) => {
						this.config.includeBacklinks = val;
						this.updatePreview();
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
						this.updatePreview();
					}, 200)) // Debounce slider
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Generate")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.lastRunSettings = this.config;
					await this.plugin.saveSettings();
					this.close();
					this.onSubmit(this.config);
				})
		);
	}

	updatePreview() {
		if (!this.previewEl) return;
		this.previewEl.setText("Updating count...");

		// Run calculation asynchronously to avoid freezing UI
		setTimeout(() => {
			let count = 0;
			if (this.source instanceof TFile) {
				count = getPreviewCount(this.app, this.plugin.settings, this.source, this.config);
			} else if (this.source instanceof TFolder) {
				count = getPreviewCountForFolder(this.app, this.plugin.settings, this.source.path, this.config);
			}
			this.previewEl.setText(`Files Included: ${count}`);
		}, 10);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Folder Suggest Modal (Existing)
 */
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
