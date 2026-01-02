import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
} from "obsidian";

type SourceLabel = "DM NOTE" | "WIKI ENTRY";

interface Candidate {
	sortKeyPath: string; // used for sorting + grouping
	originalPath: string; // actual file path to read
	sourceLabel: SourceLabel;
}

interface WikiSummarySettings {
	outputFilePath: string;

	globalExcludedDirNames: string[];
	dndwikiDirName: string;

	dmNotesLabel: SourceLabel;
	wikiLabel: SourceLabel;

	// Exclude specific files:
	excludedFilePaths: string[]; // exact paths relative to vault root
	excludedGlobs: string[]; // glob patterns (supports **, *, ?)
}

const DEFAULT_SETTINGS: WikiSummarySettings = {
	outputFilePath: "Wiki Zusammenfassung normalised.txt",

	globalExcludedDirNames: ["02_Meta", "00_Übersichten", "99_Res", "00_WikiDatein"],
	dndwikiDirName: "DnDWiki",

	dmNotesLabel: "DM NOTE",
	wikiLabel: "WIKI ENTRY",

	excludedFilePaths: [],
	excludedGlobs: [],
};

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
					await this.generateSummary();
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

	private isExcludedAtRoot(filePath: string): boolean {
		const first = filePath.split("/")[0] ?? "";
		return this.settings.globalExcludedDirNames.includes(first);
	}

	private isUnderDir(filePath: string, dirName: string): boolean {
		return filePath === dirName || filePath.startsWith(dirName + "/");
	}

	private isExcludedInsideDndWiki(filePath: string): boolean {
		const prefix = this.settings.dndwikiDirName.replace(/\/+$/, "") + "/";
		if (!filePath.startsWith(prefix)) return false;

		const rest = filePath.slice(prefix.length);
		const firstInside = rest.split("/")[0] ?? "";
		return this.settings.globalExcludedDirNames.includes(firstInside);
	}

	// iOS-safe dirname implementation (no Node `path`)
	private posixDirname(p: string): string {
		const s = normalizePath(p);
		const idx = s.lastIndexOf("/");
		if (idx === -1) return ".";        // no slash
		if (idx === 0) return "/";         // root-ish
		return s.slice(0, idx);
	}

	private normalizeWikiSortKey(originalWikiPath: string): string {
		const prefix = this.settings.dndwikiDirName.replace(/\/+$/, "") + "/";
		return originalWikiPath.startsWith(prefix)
			? originalWikiPath.slice(prefix.length)
			: originalWikiPath;
	}

	// ---- Excludes: exact paths + globs ----

	private normalizeExcludePath(p: string): string {
		const stripped = p.trim().replace(/^\.\//, "");
		return normalizePath(stripped);
	}

	private globToRegExp(glob: string): RegExp {
		const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

		const g = glob.trim();
		let re = "^";
		let i = 0;

		while (i < g.length) {
			const c = g.charAt(i);
			const next = g.charAt(i + 1);

			if (c === "*") {
				if (next === "*") {
					i += 2;
					if (g.charAt(i) === "/") i += 1;
					re += "(?:.*\\/)?";
				} else {
					i += 1;
					re += "[^/]*";
				}
			} else if (c === "?") {
				i += 1;
				re += "[^/]";
			} else {
				re += esc(c);
				i += 1;
			}
		}

		re += "$";
		return new RegExp(re);
	}

	private matchesAnyGlob(filePath: string, globs: string[]): boolean {
		for (const raw of globs) {
			const g = raw.trim();
			if (!g) continue;
			const rx = this.globToRegExp(g);
			if (rx.test(filePath)) return true;
		}
		return false;
	}

	private isExcludedFilePath(filePath: string): boolean {
		const norm = this.normalizeExcludePath(filePath);

		for (const p of this.settings.excludedFilePaths) {
			if (this.normalizeExcludePath(p) === norm) return true;
		}

		if (this.matchesAnyGlob(norm, this.settings.excludedGlobs)) return true;

		return false;
	}

	// ---- Core ----

	async generateSummary(): Promise<void> {
		const { vault } = this.app;

		const mdFiles = vault.getMarkdownFiles();
		const candidates: Candidate[] = [];

		// DM Notes
		for (const f of mdFiles) {
			const p = normalizePath(f.path);

			if (this.isExcludedFilePath(p)) continue;
			if (this.isExcludedAtRoot(p)) continue;
			if (this.isUnderDir(p, this.settings.dndwikiDirName)) continue;

			candidates.push({
				sortKeyPath: p,
				originalPath: p,
				sourceLabel: this.settings.dmNotesLabel,
			});
		}

		// Wiki Entries
		for (const f of mdFiles) {
			const p = normalizePath(f.path);

			if (this.isExcludedFilePath(p)) continue;
			if (!this.isUnderDir(p, this.settings.dndwikiDirName)) continue;
			if (this.isExcludedInsideDndWiki(p)) continue;

			candidates.push({
				sortKeyPath: this.normalizeWikiSortKey(p),
				originalPath: p,
				sourceLabel: this.settings.wikiLabel,
			});
		}

		if (candidates.length === 0) {
			await this.writeOutput("(Keine relevanten Dateien gefunden)\n");
			return;
		}

		candidates.sort((a, b) =>
			a.sortKeyPath < b.sortKeyPath ? -1 : a.sortKeyPath > b.sortKeyPath ? 1 : 0
		);

		let out = "";
		let currentDir = "";

		for (const c of candidates) {
			const dir = this.posixDirname(c.sortKeyPath);

			if (dir !== currentDir) {
				if (currentDir !== "") out += "\n";
				out += `--- DIRECTORY: ${dir} ---\n\n`;
				currentDir = dir;
			}

			out += `### ${c.sourceLabel}: ${c.originalPath} ###\n\n`;

			const file = vault.getAbstractFileByPath(c.originalPath);
			if (file instanceof TFile) {
				const content = await vault.cachedRead(file);
				out += content;
				if (!out.endsWith("\n")) out += "\n";
			} else {
				out += `FEHLER: Datei '${c.originalPath}' nicht gefunden.\n`;
			}

			out += "\n=============================================\n\n";
		}

		await this.writeOutput(out);
	}

	private async writeOutput(content: string): Promise<void> {
		const { vault } = this.app;
		const targetPath = normalizePath(this.settings.outputFilePath);

		const existing = vault.getAbstractFileByPath(targetPath);
		if (existing instanceof TFile) {
			await vault.modify(existing, content);
			return;
		}

		const parts = targetPath.split("/");
		if (parts.length > 1) {
			const folder = parts.slice(0, -1).join("/");
			if (!vault.getAbstractFileByPath(folder)) {
				await vault.createFolder(folder);
			}
		}

		await vault.create(targetPath, content);
	}
}

class WikiSummarySettingTab extends PluginSettingTab {
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
