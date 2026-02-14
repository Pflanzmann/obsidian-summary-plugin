import { App, PluginSettingTab, Setting } from "obsidian";
import { VaultSummarySettings, SummaryPluginInterface } from "./types";

export const DEFAULT_SETTINGS: VaultSummarySettings = {
	outputFilePath: "Vault Summary.txt",
	globalExcludedDirNames: ["Templates", "Meta", "Archives"],

	enableMirroring: false, // Default to disabled
	mirrorFolderPath: "PublicMirror",
	primaryLabel: "PRIMARY",
	mirrorLabel: "MIRROR",

	excludedFilePaths: [],
	excludedGlobs: [],
	scanDepth: 1,

	backlinksOnRootOnly: false, // Default to checking all levels

	lastRunSettings: {
		includeMentions: true,
		includeBacklinks: false,
		depth: 1
	}
};

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

		// --- General Settings ---
		new Setting(containerEl)
			.setName("Base Output Path")
			.setDesc("The base filename. In Folder/File modes, the source name is appended.")
			.addText((text) =>
				text
					.setPlaceholder("Vault Summary.txt")
					.setValue(this.plugin.settings.outputFilePath)
					.onChange(async (value) => {
						this.plugin.settings.outputFilePath = value.trim() || DEFAULT_SETTINGS.outputFilePath;
						await this.plugin.saveSettings();
					})
			);

		// --- Graph Traversal Settings ---
		containerEl.createEl("h3", { text: "Graph Traversal" });

		new Setting(containerEl)
			.setName("Limit Backlinks to Roots")
			.setDesc("If enabled, incoming links (backlinks) are only checked for the starting Root files. Files found deeper in the graph will not be scanned for their own backlinks.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.backlinksOnRootOnly)
					.onChange(async (value) => {
						this.plugin.settings.backlinksOnRootOnly = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Mirroring Toggle ---
		containerEl.createEl("h3", { text: "Mirror Mode" });

		new Setting(containerEl)
			.setName("Enable Primary & Mirror Logic")
			.setDesc("If enabled, the plugin will look for a 'Mirror' folder to distinguish between internal (Primary) and public (Mirror) versions of your notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableMirroring)
					.onChange(async (value) => {
						this.plugin.settings.enableMirroring = value;
						await this.plugin.saveSettings();
						// Re-render the settings to show/hide the sub-settings
						this.display();
					})
			);

		// --- Conditional Mirror Settings ---
		if (this.plugin.settings.enableMirroring) {
			const mirrorContainer = containerEl.createEl("div", { cls: "vs-mirror-settings-container" });
			mirrorContainer.style.borderLeft = "2px solid var(--text-muted)";
			mirrorContainer.style.paddingLeft = "12px";
			mirrorContainer.style.marginLeft = "4px";

			new Setting(mirrorContainer)
				.setName("Mirror folder path")
				.setDesc("The folder containing the secondary/mirror versions of notes.")
				.addText((text) =>
					text
						.setValue(this.plugin.settings.mirrorFolderPath)
						.onChange(async (value) => {
							this.plugin.settings.mirrorFolderPath = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(mirrorContainer)
				.setName("Primary Source Name")
				.setDesc("Label in the summary for files OUTSIDE the mirror folder.")
				.addText((text) =>
					text
						.setPlaceholder("PRIMARY")
						.setValue(this.plugin.settings.primaryLabel)
						.onChange(async (value) => {
							this.plugin.settings.primaryLabel = value.trim() || "PRIMARY";
							await this.plugin.saveSettings();
						})
				);

			new Setting(mirrorContainer)
				.setName("Mirror Source Name")
				.setDesc("Label in the summary for files INSIDE the mirror folder.")
				.addText((text) =>
					text
						.setPlaceholder("MIRROR")
						.setValue(this.plugin.settings.mirrorLabel)
						.onChange(async (value) => {
							this.plugin.settings.mirrorLabel = value.trim() || "MIRROR";
							await this.plugin.saveSettings();
						})
				);
		}

		// --- Exclusion Settings ---
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
