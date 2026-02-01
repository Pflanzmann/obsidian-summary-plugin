import { Notice, Plugin } from "obsidian";
import { WikiSummarySettings } from "./types";
import { DEFAULT_SETTINGS, WikiSummarySettingTab } from "./settings";
import { generateSummary } from "./generator";

export default class WikiSummaryNormalisedPlugin extends Plugin {
	settings: WikiSummarySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		this.addSettingTab(new WikiSummarySettingTab(this.app, this));

		this.addCommand({
			id: "generate-wiki-summary-normalised",
			name: "Generate wiki summary (normalised)",
			callback: async () => {
				try {
					await generateSummary(this.app, this.settings);
					new Notice(`Summary written to: ${this.settings.outputFilePath}`);
				} catch (err: any) {
					console.error(err);
					new Notice(`Failed: ${err?.message ?? String(err)}`);
				}
			},
		});
	}

	async onunload() {}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
