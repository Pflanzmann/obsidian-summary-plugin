import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
import { VaultSummarySettings } from "../types";

export class FileSuggestModal extends FuzzySuggestModal<TFile> {
	settings: VaultSummarySettings;
	onChoose: (file: TFile) => void;

	constructor(app: App, settings: VaultSummarySettings, onChoose: (file: TFile) => void) {
		super(app);
		this.settings = settings;
		this.onChoose = onChoose;
		this.setPlaceholder("Select a starting file (🕒 = Recent)...");
	}

	getItems(): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();
		const history = this.settings.recentFiles;
		return allFiles.sort((a, b) => {
			const idxA = history.indexOf(a.path);
			const idxB = history.indexOf(b.path);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.path.localeCompare(b.path);
		});
	}
	getItemText(file: TFile): string {
		const isRecent = this.settings.recentFiles.includes(file.path);
		return isRecent ? `🕒 ${file.path}` : file.path;
	}
	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(file);
	}
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
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
