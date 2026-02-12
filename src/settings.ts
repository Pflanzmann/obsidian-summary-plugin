import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { VaultSummarySettings } from "./types";

export const DEFAULT_SETTINGS: VaultSummarySettings = {
	outputFilePath: "Vault Summary.txt",
	globalExcludedDirNames: ["Templates", "Meta", "Archives"],
	mirrorFolderPath: "PublicMirror",

	primaryLabel: "PRIMARY",
	mirrorLabel: "MIRROR",

	excludedFilePaths: [],
	excludedGlobs: [],
	recentFolders: [],
	scanDepth: 1,

	// Defaults for Single File Mode
	singleFileSettings: {
		includeMentions: true,
		includeBacklinks: false,
		depth: 1
	}
};

interface SummaryPluginInterface extends Plugin {
	settings: VaultSummarySettings;
	saveSettings(): Promise<void>;
}

export class SummarySettingTab extends PluginSettingTab {
	plugin: SummaryPluginInterface;

	constructor(app: App, plugin: SummaryPluginInterface) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Vault Summary — Settings" });

		new Setting(containerEl)
			.setName("Output file path")
			.setDesc("Where the summary will be written.")
			.addText((text) =>
				text
					.setPlaceholder("Vault Summary.txt")
					.setValue(this.plugin.settings.outputFilePath)
					.onChange(async (value) => {
						this.plugin.settings.outputFilePath = value.trim() || DEFAULT_SETTINGS.outputFilePath;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Folder Scan Defaults" });

		new Setting(containerEl)
			.setName("Link Scan Depth")
			.setDesc("Default depth for Folder Scan mode.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 5, 1)
					.setValue(this.plugin.settings.scanDepth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.scanDepth = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Source Labels" });

		new Setting(containerEl)
			.setName("Primary Source Name")
			.setDesc("Label for standard files found in your vault.")
			.addText((text) =>
				text
					.setPlaceholder("PRIMARY")
					.setValue(this.plugin.settings.primaryLabel)
					.onChange(async (value) => {
						this.plugin.settings.primaryLabel = value.trim() || "PRIMARY";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Mirror/Secondary Source Name")
			.setDesc("Label for files found inside the Mirror Folder.")
			.addText((text) =>
				text
					.setPlaceholder("MIRROR")
					.setValue(this.plugin.settings.mirrorLabel)
					.onChange(async (value) => {
						this.plugin.settings.mirrorLabel = value.trim() || "MIRROR";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Mirror Configuration" });

		new Setting(containerEl)
			.setName("Mirror folder path")
			.setDesc("The folder containing the secondary/mirror versions of notes.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.mirrorFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.mirrorFolderPath = value.trim() || DEFAULT_SETTINGS.mirrorFolderPath;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Exclusions" });

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
