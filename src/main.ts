import { App, Notice, Plugin, FuzzySuggestModal, TFolder } from "obsidian";
import { WikiSummarySettings } from "./types";
import { DEFAULT_SETTINGS, WikiSummarySettingTab } from "./settings";
import { generateSummary, generateSummaryFromLinks } from "./generator";

export default class WikiSummaryNormalisedPlugin extends Plugin {
	settings: WikiSummarySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		this.addSettingTab(new WikiSummarySettingTab(this.app, this));

		this.addCommand({
			id: "generate-wiki-summary-normalised",
			name: "Generate wiki summary (Entire Vault)",
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
			id: "generate-wiki-summary-from-links",
			name: "Generate wiki summary (Select Folder...)",
			callback: async () => {
				// Pass settings to the modal so it knows the history
				new FolderSuggestModal(this.app, this.settings, async (selectedFolder) => {

					// 1. Update History
					await this.addToHistory(selectedFolder.path);

					// 2. Run Generator
					try {
						await generateSummaryFromLinks(this.app, this.settings, selectedFolder.path);
					} catch (err: any) {
						console.error(err);
						new Notice(`Failed: ${err?.message ?? String(err)}`);
					}
				}).open();
			},
		});
	}

	async addToHistory(path: string) {
		// Remove if already exists (so we can move it to the top)
		let recents = this.settings.recentFolders.filter(p => p !== path);

		// Add to start
		recents.unshift(path);

		// Limit to 5 items
		if (recents.length > 5) {
			recents = recents.slice(0, 5);
		}

		this.settings.recentFolders = recents;
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * A modal that lists folders, prioritizing recent ones.
 */
class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	settings: WikiSummarySettings;
	onChoose: (folder: TFolder) => void;

	constructor(app: App, settings: WikiSummarySettings, onChoose: (folder: TFolder) => void) {
		super(app);
		this.settings = settings;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a folder to scan (🕒 = Recent)");
	}

	getItems(): TFolder[] {
		const allFolders = this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder);

		const history = this.settings.recentFolders;

		// Sort: Recents first (in order of history), then alphabetical
		return allFolders.sort((a, b) => {
			const idxA = history.indexOf(a.path);
			const idxB = history.indexOf(b.path);

			// Both are in history: sort by index (lower index = more recent)
			if (idxA !== -1 && idxB !== -1) {
				return idxA - idxB;
			}

			// A is in history, B is not
			if (idxA !== -1) return -1;

			// B is in history, A is not
			if (idxB !== -1) return 1;

			// Neither in history: sort alphabetical
			return a.path.localeCompare(b.path);
		});
	}

	getItemText(folder: TFolder): string {
		const isRecent = this.settings.recentFolders.includes(folder.path);
		// Add a visual indicator
		return isRecent ? `🕒 ${folder.path}` : folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(folder);
	}
}
