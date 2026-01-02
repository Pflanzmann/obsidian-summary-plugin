import { App, PluginSettingTab, Setting } from "obsidian";
import WikiSummaryNormalisedPlugin from "./main";

export class WikiSummarySettingTab extends PluginSettingTab {
	plugin: WikiSummaryNormalisedPlugin;

	constructor(app: App, plugin: WikiSummaryNormalisedPlugin) {
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
						this.plugin.settings.outputFilePath = value.trim() || "Wiki Zusammenfassung normalised.txt";
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
						this.plugin.settings.dndwikiDirName = value.trim() || "DnDWiki";
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
						this.plugin.settings.globalExcludedDirNames = dirs.length ? dirs : ["02_Meta", "00_Übersichten", "99_Res", "00_WikiDatein"];
						await this.plugin.saveSettings();
					})
			);
	}
}
