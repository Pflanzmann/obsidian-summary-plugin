import { App, Notice, Plugin, FuzzySuggestModal, TFolder, TFile, Modal, Setting } from "obsidian";
import { VaultSummarySettings, SingleFileRunConfig } from "./types";
import { DEFAULT_SETTINGS, SummarySettingTab } from "./settings";
import { generateSummary, generateSummaryFromLinks, generateSummaryFromFile } from "./generator";

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

		// 2. Folder Mode
		this.addCommand({
			id: "generate-vault-summary-from-links",
			name: "Generate summary (Select Folder...)",
			callback: async () => {
				new FolderSuggestModal(this.app, this.settings, async (selectedFolder) => {
					await this.addToHistory(selectedFolder.path);
					try {
						await generateSummaryFromLinks(this.app, this.settings, selectedFolder.path);
					} catch (err: any) {
						console.error(err);
						new Notice(`Failed: ${err?.message ?? String(err)}`);
					}
				}).open();
			},
		});

		// 3. Single File Mode
		this.addCommand({
			id: "generate-vault-summary-single-file",
			name: "Generate summary (Select File...)",
			callback: async () => {
				new FileSuggestModal(this.app, (file) => {
					// Pass the plugin instance so the modal can read/save settings
					new SingleFileConfigModal(this.app, this, file, async (config) => {
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
 * Configuration Dialog for Single File Mode
 */
class SingleFileConfigModal extends Modal {
	plugin: VaultSummaryPlugin;
	file: TFile;
	onSubmit: (config: SingleFileRunConfig) => void;

	config: SingleFileRunConfig;

	constructor(
		app: App,
		plugin: VaultSummaryPlugin,
		file: TFile,
		onSubmit: (config: SingleFileRunConfig) => void
	) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.onSubmit = onSubmit;

		// Load from saved settings or use defaults
		this.config = { ...this.plugin.settings.singleFileSettings };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `Generate Summary for: ${this.file.basename}` });

		new Setting(contentEl)
			.setName("Include Mentions (Outgoing)")
			.setDesc("Include files linked FROM this file.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.config.includeMentions)
					.onChange((val) => (this.config.includeMentions = val))
			);

		new Setting(contentEl)
			.setName("Include Backlinks (Incoming)")
			.setDesc("Include files that link TO this file.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.config.includeBacklinks)
					.onChange((val) => (this.config.includeBacklinks = val))
			);

		new Setting(contentEl)
			.setName("Search Depth")
			.setDesc("How many levels deep to traverse.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 1) // Start at 1 (File itself is 0, +1 for neighbors)
					.setValue(this.config.depth)
					.setDynamicTooltip()
					.onChange((val) => (this.config.depth = val))
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Generate")
				.setCta()
				.onClick(async () => {
					// Save settings for next time
					this.plugin.settings.singleFileSettings = this.config;
					await this.plugin.saveSettings();

					this.close();
					this.onSubmit(this.config);
				})
		);
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
