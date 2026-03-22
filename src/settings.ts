import { App, PluginSettingTab, Setting } from "obsidian";
import { VaultSummarySettings, SummaryPluginInterface } from "./types";

export const DEFAULT_SETTINGS: VaultSummarySettings = {
	outputFilePath: "Vault summary.txt",
	globalExcludedDirNames: ["Templates", "Meta", "Archives"],

	enableMirroring: false,
	mirrorFolderPath: "PublicMirror",
	primaryLabel: "PRIMARY",
	mirrorLabel: "MIRROR",

	excludedFilePaths: [],
	excludedGlobs: [],

	alwaysIncludePathsAsRoots: [],
	alwaysIncludePathsAsLinks: [],

	scanDepth: 1,

	backlinksOnRootOnly: false,

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

		containerEl.createEl("h2", { text: "Settings" });

		new Setting(containerEl)
			.setName("Base output path")
			.setDesc("The base filename. In folder/file modes, the source name is appended.")
			.addText((text) =>
				text
					.setPlaceholder("Vault summary.txt")
					.setValue(this.plugin.settings.outputFilePath)
					.onChange(async (value) => {
						this.plugin.settings.outputFilePath = value.trim() || DEFAULT_SETTINGS.outputFilePath;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Persistent inclusions" });
		containerEl.createEl("p", { text: "Paths specified here will be added to every summary request (except entire vault, where they are included implicitly). Mirroring logic is applied to these paths.", cls: "setting-item-description"});

		new Setting(containerEl)
			.setName("Always include as root files")
			.setDesc("Comma separated exact paths. These files become starting points.")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.alwaysIncludePathsAsRoots.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.alwaysIncludePathsAsRoots = value.split(",").map((s) => s.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Always include as linked files")
			.setDesc("Comma separated exact paths. These files are added but not used as starting points.")
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.alwaysIncludePathsAsLinks.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.alwaysIncludePathsAsLinks = value.split(",").map((s) => s.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Graph traversal" });

		new Setting(containerEl)
			.setName("Limit backlinks to roots")
			.setDesc("If enabled, backlinks are only checked for the starting root files. Files found deeper in the graph will not be scanned for their own backlinks.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.backlinksOnRootOnly)
					.onChange(async (value) => {
						this.plugin.settings.backlinksOnRootOnly = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Mirror mode" });

		new Setting(containerEl)
			.setName("Enable primary & mirror logic")
			.setDesc("If enabled, the plugin will look for a 'mirror' folder to distinguish between primary and mirror versions of your notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableMirroring)
					.onChange(async (value) => {
						this.plugin.settings.enableMirroring = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.enableMirroring) {
			const mirrorContainer = containerEl.createEl("div", { cls: "vs-mirror-settings-container" });

			new Setting(mirrorContainer)				.setName("Mirror folder path")
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
				.setName("Primary source name")
				.setDesc("Label in the summary for files outside the mirror folder.")
				.addText((text) =>
					text
						.setPlaceholder("primary")
						.setValue(this.plugin.settings.primaryLabel)
						.onChange(async (value) => {
							this.plugin.settings.primaryLabel = value.trim() || "primary";
							await this.plugin.saveSettings();
						})
				);

			new Setting(mirrorContainer)
				.setName("Mirror source name")
				.setDesc("Label in the summary for files inside the mirror folder.")
				.addText((text) =>
					text
						.setPlaceholder("mirror")
						.setValue(this.plugin.settings.mirrorLabel)
						.onChange(async (value) => {
							this.plugin.settings.mirrorLabel = value.trim() || "mirror";
							await this.plugin.saveSettings();
						})
				);
		}

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
