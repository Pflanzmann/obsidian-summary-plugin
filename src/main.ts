import { App, Notice, Plugin, TFile, TFolder, TAbstractFile, normalizePath } from "obsidian";
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		await this.loadHistory();

		this.addSettingTab(new SummarySettingTab(this.app, this));
		loadPluginStyles();

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

		this.addCommand({
			id: "generate-vault-summary-from-links",
			name: "Generate summary: Choose folder...",
			callback: async () => {
				new FolderSuggestModal(this.app, this.settings, this.history, (selectedFolder) => {
					new SummaryConfigModal(this.app, this, selectedFolder, async (files, config, rootFiles) => {
						await this.addFolderToHistory(selectedFolder.path);
						try {
							const folderName = selectedFolder.path.split('/').pop() || "Folder";
							await generateSummaryFromFiles(this.app, this.settings, files, folderName, rootFiles);
						} catch (err: any) {
							console.error(err);
							new Notice(`Failed: ${err?.message ?? String(err)}`);
						}
					}).open();
				}).open();
			},
		});

		this.addCommand({
			id: "generate-vault-summary-single-file",
			name: "Generate summary: Choose file...",
			callback: async () => {
				new FileSuggestModal(this.app, this.settings, this.history, (file) => {
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

		this.addCommand({
			id: "generate-vault-summary-current-file",
			name: "Generate summary: Active file",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile instanceof TFile && activeFile.extension === "md") {
					if (!checking) {
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

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFolder || (file instanceof TFile && file.extension === "md")) {
					menu.addItem((item) => {
						item
							.setTitle("Generate summary")
							.setIcon("file-text")
							.onClick(() => {
								new SummaryConfigModal(this.app, this, file, async (files, config, rootFiles) => {
									if (file instanceof TFile) await this.addFileToHistory(file.path);
									if (file instanceof TFolder) await this.addFolderToHistory(file.path);
									try {
										const sourceName = file instanceof TFile ? file.basename : file.name;
										await generateSummaryFromFiles(this.app, this.settings, files, sourceName, rootFiles);
									} catch (err: any) {
										console.error(err);
										new Notice(`Failed: ${err?.message ?? String(err)}`);
									}
								}).open();
							});
					});
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("files-menu", (menu, files) => {
				const hasValidItem = files.some(f => f instanceof TFolder || (f instanceof TFile && f.extension === "md"));
				if (!hasValidItem) return;

				menu.addItem((item) => {
					item
						.setTitle("Generate summary")
						.setIcon("file-text")
						.onClick(() => {
							new SummaryConfigModal(this.app, this, files, async (outFiles, config, rootFiles) => {
								try {
									await generateSummaryFromFiles(this.app, this.settings, outFiles, "Multiple Selection", rootFiles);
								} catch (err: any) {
									console.error(err);
									new Notice(`Failed: ${err?.message ?? String(err)}`);
								}
							}).open();
						});
				});
			})
		);
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
