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
				// Pass this.history to the modal
				new FolderSuggestModal(this.app, this.settings, this.history, (selectedFolder) => {
					new SummaryConfigModal(this.app, this, selectedFolder, async (files, config) => {
						await this.addFolderToHistory(selectedFolder.path);
						try {
							const folderName = selectedFolder.path.split('/').pop() || "Folder";
							const roots = files.filter(f => f.path.startsWith(selectedFolder.path + "/"));

							await generateSummaryFromFiles(this.app, this.settings, files, folderName, roots);
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
				// Pass this.history to the modal
				new FileSuggestModal(this.app, this.settings, this.history, (file) => {
					new SummaryConfigModal(this.app, this, file, async (files, config) => {
						await this.addFileToHistory(file.path);
						try {
							await generateSummaryFromFiles(this.app, this.settings, files, file.basename, [file]);
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
								await generateSummaryFromFiles(this.app, this.settings, files, activeFile.basename, [activeFile]);
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

	/**
	 * Loads history from manifestDir/history.json
	 */
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

	/**
	 * Saves history to manifestDir/history.json
	 */
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
		await this.saveHistory(); // Save to separate file
	}

	async addFileToHistory(path: string) {
		let recents = this.history.recentFiles.filter(p => p !== path);
		recents.unshift(path);
		if (recents.length > 5) recents = recents.slice(0, 5);
		this.history.recentFiles = recents;
		await this.saveHistory(); // Save to separate file
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
