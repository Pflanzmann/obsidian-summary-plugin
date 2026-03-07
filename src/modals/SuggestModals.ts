import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
import { VaultSummarySettings, VaultSummaryHistory } from "../types";

export class FileSuggestModal extends FuzzySuggestModal<TFile> {
	settings: VaultSummarySettings;
	history: VaultSummaryHistory;
	onChoose: (file: TFile) => void;

	constructor(
		app: App,
		settings: VaultSummarySettings,
		history: VaultSummaryHistory,
		onChoose: (file: TFile) => void
	) {
		super(app);
		this.settings = settings;
		this.history = history;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a starting file (🕒 = Recent)...");
	}

	getItems(): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();
		const recents = this.history.recentFiles;

		return allFiles.sort((a, b) => {
			const idxA = recents.indexOf(a.path);
			const idxB = recents.indexOf(b.path);

			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.path.localeCompare(b.path);
		});
	}

	getItemText(file: TFile): string {
		const isRecent = this.history.recentFiles.includes(file.path);
		return isRecent ? `🕒 ${file.path}` : file.path;
	}

	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(file);
	}
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	settings: VaultSummarySettings;
	history: VaultSummaryHistory;
	onChoose: (folder: TFolder) => void;

	constructor(
		app: App,
		settings: VaultSummarySettings,
		history: VaultSummaryHistory,
		onChoose: (folder: TFolder) => void
	) {
		super(app);
		this.settings = settings;
		this.history = history;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a folder to scan (🕒 = Recent)");
	}

	getItems(): TFolder[] {
		const allFolders = this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder);
		const recents = this.history.recentFolders;

		return allFolders.sort((a, b) => {
			const idxA = recents.indexOf(a.path);
			const idxB = recents.indexOf(b.path);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.path.localeCompare(b.path);
		});
	}

	getItemText(folder: TFolder): string {
		const isRecent = this.history.recentFolders.includes(folder.path);
		return isRecent ? `🕒 ${folder.path}` : folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(folder);
	}
}
