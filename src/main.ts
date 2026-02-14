import { App, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { VaultSummarySettings, VaultSummaryHistory, SummaryPluginInterface } from "./types";
import { DEFAULT_SETTINGS, SummarySettingTab } from "./settings";
import { generateSummary, generateSummaryFromFiles } from "./generator";
import { loadPluginStyles } from "./styles";
import { FileSuggestModal, FolderSuggestModal } from "./modals/SuggestModals";
import { SummaryConfigModal } from "./modals/SummaryConfigModal";

const DEFAULT_HISTORY: VaultSummaryHistory = {
	recentFiles: [],
	recentFolders: []
};

export default class VaultSummaryPlugin extends Plugin implements SummaryPluginInterface {
	settings: VaultSummarySettings;
	history: VaultSummaryHistory;

	async onload() {
		// Load Settings (data.json)
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Load History (history.json)
		await this.loadHistory();

		this.addSettingTab(new SummarySettingTab(this.app, this));
		loadPluginStyles();

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
				new FolderSuggestModal(this.app, this.settings, this.history, (selectedFolder) => {
					// Updated callback signature with rootFiles
					new SummaryConfigModal(this.app, this, selectedFolder, async (files, config, rootFiles) => {
						await this.addFolderToHistory(selectedFolder.path);
						try {
							const folderName = selectedFolder.path.split('/').pop() || "Folder";
							// Use explicit rootFiles from modal
							await generateSummaryFromFiles(this.app, this.settings, files, folderName, rootFiles);
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
				new FileSuggestModal(this.app, this.settings, this.history, (file) => {
					// Updated callback signature with rootFiles
					new SummaryConfigModal(this.app, this, file, async (files, config, rootFiles) => {
						await this.addFileToHistory(file.path);
						try {
							await generateSummaryFromFiles(this.app, this.settings, files, file.basename, rootFiles);
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
						// Updated callback signature with rootFiles
						new SummaryConfigModal(this.app, this, activeFile, async (files, config, rootFiles) => {
							await this.addFileToHistory(activeFile.path);
							try {
								await generateSummaryFromFiles(this.app, this.settings, files, activeFile.basename, rootFiles);
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

	async loadHistory() {
		this.history = Object.assign({}, DEFAULT_HISTORY);
		const path = normalizePath(`${this.manifest.dir}/history.json`);
		if (await this.app.vault.adapter.exists(path)) {
			try {
				const content = await this.app.vault.adapter.read(path);
				const loaded = JSON.parse(content);
				this.history = Object.assign({}, DEFAULT_HISTORY, loaded);
			} catch (e) {
				console.error("Failed to parse history.json", e);
			}
		}
	}

	async saveHistory() {
		const path = normalizePath(`${this.manifest.dir}/history.json`);
		try {
			await this.app.vault.adapter.write(path, JSON.stringify(this.history, null, 2));
		} catch (e) {
			console.error("Failed to save history.json", e);
		}
	}

	async addFolderToHistory(path: string) {
		let recents = this.history.recentFolders.filter(p => p !== path);
		recents.unshift(path);
		if (recents.length > 5) recents = recents.slice(0, 5);
		this.history.recentFolders = recents;
		await this.saveHistory();
	}

	async addFileToHistory(path: string) {
		let recents = this.history.recentFiles.filter(p => p !== path);
		recents.unshift(path);
		if (recents.length > 5) recents = recents.slice(0, 5);
		this.history.recentFiles = recents;
		await this.saveHistory();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
