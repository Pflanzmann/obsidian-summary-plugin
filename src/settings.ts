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
};

// Interface to ensure the plugin passed to the tab has what we need
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
			.setDesc("Where the summary will be written (relative to vault root).")
			.addText((text) =>
				text
					.setPlaceholder("Wiki Zusammenfassung normalised.txt")
					.setValue(this.plugin.settings.outputFilePath)
					.onChange(async (value) => {
						this.plugin.settings.outputFilePath =
							value.trim() || DEFAULT_SETTINGS.outputFilePath;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("DnDWiki folder name")
			.setDesc("Folder that contains wiki entries.")
			.addText((text) =>
				text
					.setPlaceholder("DnDWiki")
					.setValue(this.plugin.settings.dndwikiDirName)
					.onChange(async (value) => {
						this.plugin.settings.dndwikiDirName =
							value.trim() || DEFAULT_SETTINGS.dndwikiDirName;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded root folders")
			.setDesc("Comma-separated folder names to skip at vault root (and inside DnDWiki).")
			.addTextArea((area) =>
				area
					.setPlaceholder("02_Meta,00_Übersichten,99_Res,00_WikiDatein")
					.setValue(this.plugin.settings.globalExcludedDirNames.join(","))
					.onChange(async (value) => {
						const dirs = value
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						this.plugin.settings.globalExcludedDirNames = dirs.length
							? dirs
							: DEFAULT_SETTINGS.globalExcludedDirNames;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded file paths")
			.setDesc("Comma-separated exact paths to exclude. Example: Campaign/secret.md")
			.addTextArea((area) =>
				area
					.setPlaceholder("Campaign/secret.md, DnDWiki/Private/lore.md")
					.setValue(this.plugin.settings.excludedFilePaths.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludedFilePaths = value
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded globs")
			.setDesc(
				"One pattern per line. Supports **, *, ?. Examples:\n**/*Session*.md\n**/WIP/**\nDnDWiki/**/Private*.md"
			)
			.addTextArea((area) =>
				area
					.setPlaceholder("**/*Session*.md\n**/WIP/**\nDnDWiki/**/Private*.md")
					.setValue(this.plugin.settings.excludedGlobs.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludedGlobs = value
							.split("\n")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					})
			);
	}
}
