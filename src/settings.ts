import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { WikiSummarySettings } from "./types";

export const DEFAULT_SETTINGS: WikiSummarySettings = {
	outputFilePath: "Wiki Zusammenfassung normalised.txt",
	globalExcludedDirNames: ["02_Meta", "00_Übersichten", "99_Res", "00_WikiDatein"],
	dndwikiDirName: "DnDWiki",
	dmNotesLabel: "DM NOTE",
	wikiLabel: "WIKI ENTRY",
	excludedFilePaths: [],
	excludedGlobs: [],
	recentFolders: [],
};

interface WikiPluginInterface extends Plugin {
	settings: WikiSummarySettings;
	saveSettings(): Promise<void>;
}

export class WikiSummarySettingTab extends PluginSettingTab {
	plugin: WikiPluginInterface;

	constructor(app: App, plugin: WikiPluginInterface) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Wiki Summary Normalised — Settings" });

		new Setting(containerEl)
			.setName("Output file path")
			.setDesc("Where the summary will be written.")
			.addText((text) =>
				text
					.setPlaceholder("Wiki Zusammenfassung normalised.txt")
					.setValue(this.plugin.settings.outputFilePath)
					.onChange(async (value) => {
						this.plugin.settings.outputFilePath = value.trim() || DEFAULT_SETTINGS.outputFilePath;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Structure" });

		new Setting(containerEl)
			.setName("DnDWiki folder name")
			.setDesc("Folder that contains wiki entries.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.dndwikiDirName)
					.onChange(async (value) => {
						this.plugin.settings.dndwikiDirName = value.trim() || DEFAULT_SETTINGS.dndwikiDirName;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded root folders")
			.setDesc("Comma-separated folder names to skip.")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.globalExcludedDirNames.join(","))
					.onChange(async (value) => {
						const dirs = value.split(",").map((s) => s.trim()).filter(Boolean);
						this.plugin.settings.globalExcludedDirNames = dirs.length ? dirs : DEFAULT_SETTINGS.globalExcludedDirNames;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Exclusions" });

		new Setting(containerEl)
			.setName("Excluded file paths")
			.setDesc("Comma-separated exact paths.")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.excludedFilePaths.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludedFilePaths = value.split(",").map((s) => s.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded globs")
			.setDesc("One pattern per line.")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.excludedGlobs.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludedGlobs = value.split("\n").map((s) => s.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					})
			);
	}
}
