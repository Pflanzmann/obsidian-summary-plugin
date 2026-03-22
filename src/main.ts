import {Notice, Plugin, TFile, TFolder, normalizePath} from "obsidian";
import {VaultSummarySettings, VaultSummaryHistory, SummaryPluginInterface} from "./types";
import {DEFAULT_SETTINGS, SummarySettingTab} from "./settings";
import {generateSummary, generateSummaryFromFiles} from "./generator";
import {FileSuggestModal, FolderSuggestModal} from "./modals/SuggestModals";
import {SummaryConfigModal} from "./modals/SummaryConfigModal";

const DEFAULT_HISTORY: VaultSummaryHistory = {
	recentFiles: [],
	recentFolders: []
};

export default class VaultSummaryPlugin extends Plugin implements SummaryPluginInterface {
	settings: VaultSummarySettings;
	history: VaultSummaryHistory;

	async onload() {
		const loadedSettings = (await this.loadData()) as Partial<VaultSummarySettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings || {});

		await this.loadHistory();

		this.addSettingTab(new SummarySettingTab(this.app, this));

		this.addCommand({
			id: "generate-vault-summary",
			name: "Generate summary for the entire vault",
			callback: async () => {
				try {
					await generateSummary(this.app, this.settings);
				} catch (err) {
					console.error(err);
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed: ${msg}`);
				}
			},
		});

		this.addCommand({
			id: "generate-vault-summary-from-links",
			name: "Generate summary for a choose folder",
			callback: () => {
				new FolderSuggestModal(this.app, this.settings, this.history, (selectedFolder) => {
					new SummaryConfigModal(this.app, this, selectedFolder, (files, config, rootFiles) => {
						const process = async () => {
							await this.addFolderToHistory(selectedFolder.path);
							try {
								const folderName = selectedFolder.path.split('/').pop() || "Folder";
								await generateSummaryFromFiles(this.app, this.settings, files, folderName, rootFiles);
							} catch (err) {
								console.error(err);
								const msg = err instanceof Error ? err.message : String(err);
								new Notice(`Failed: ${msg}`);
							}
						};
						void process();
					}).open();
				}).open();
			},
		});

		this.addCommand({
			id: "generate-vault-summary-single-file",
			name: "Generate summary for a choose file",
			callback: () => {
				new FileSuggestModal(this.app, this.settings, this.history, (file) => {
					new SummaryConfigModal(this.app, this, file, (files, config, rootFiles) => {
						const process = async () => {
							await this.addFileToHistory(file.path);
							try {
								await generateSummaryFromFiles(this.app, this.settings, files, file.basename, rootFiles);
							} catch (err) {
								console.error(err);
								const msg = err instanceof Error ? err.message : String(err);
								new Notice(`Failed: ${msg}`);
							}
						};
						void process();
					}).open();
				}).open();
			},
		});

		this.addCommand({
			id: "generate-vault-summary-current-file",
			name: "Generate summary for the active file",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile instanceof TFile && activeFile.extension === "md") {
					if (!checking) {
						new SummaryConfigModal(this.app, this, activeFile, (files, config, rootFiles) => {
							const process = async () => {
								await this.addFileToHistory(activeFile.path);
								try {
									await generateSummaryFromFiles(this.app, this.settings, files, activeFile.basename, rootFiles);
								} catch (err) {
									console.error(err);
									const msg = err instanceof Error ? err.message : String(err);
									new Notice(`Failed: ${msg}`);
								}
							};
							void process();
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
								new SummaryConfigModal(this.app, this, file, (files, config, rootFiles) => {
									const process = async () => {
										if (file instanceof TFile) await this.addFileToHistory(file.path);
										if (file instanceof TFolder) await this.addFolderToHistory(file.path);
										try {
											const sourceName = file instanceof TFile ? file.basename : file.name;
											await generateSummaryFromFiles(this.app, this.settings, files, sourceName, rootFiles);
										} catch (err) {
											console.error(err);
											const msg = err instanceof Error ? err.message : String(err);
											new Notice(`Failed: ${msg}`);
										}
									};
									void process();
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
							new SummaryConfigModal(this.app, this, files, (outFiles, config, rootFiles) => {
								const process = async () => {
									try {
										await generateSummaryFromFiles(this.app, this.settings, outFiles, "Multiple selection", rootFiles);
									} catch (err) {
										console.error(err);
										const msg = err instanceof Error ? err.message : String(err);
										new Notice(`Failed: ${msg}`);
									}
								};
								void process();
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
				const loaded = JSON.parse(content) as Partial<VaultSummaryHistory>;
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
