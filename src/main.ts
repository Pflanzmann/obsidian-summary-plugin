import { App, Notice, Plugin, TFile } from "obsidian";
import { VaultSummarySettings, SummaryPluginInterface } from "./types";
import { DEFAULT_SETTINGS, SummarySettingTab } from "./settings";
import { generateSummary, generateSummaryFromFiles } from "./generator";
import { loadPluginStyles } from "./styles";
import { FileSuggestModal, FolderSuggestModal } from "./modals/SuggestModals";
import { SummaryConfigModal } from "./modals/SummaryConfigModal";

export default class VaultSummaryPlugin extends Plugin implements SummaryPluginInterface {
	settings: VaultSummarySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
				new FolderSuggestModal(this.app, this.settings, (selectedFolder) => {
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
				new FileSuggestModal(this.app, this.settings, (file) => {
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
