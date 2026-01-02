import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import * as path from "path";
import { WikiSummarySettingTab } from "./settings";

type SourceLabel = "DM NOTE" | "WIKI ENTRY";

interface Candidate {
	sortKeyPath: string;       // used for sorting + grouping
	originalPath: string;      // actual file path to read
	sourceLabel: SourceLabel;
}

interface WikiSummarySettings {
	outputFilePath: string;

	globalExcludedDirNames: string[];
	dndwikiDirName: string;

	dmNotesLabel: SourceLabel;
	wikiLabel: SourceLabel;
}

const DEFAULT_SETTINGS: WikiSummarySettings = {
	outputFilePath: "Wiki Zusammenfassung normalised.txt",

	globalExcludedDirNames: ["02_Meta", "00_Übersichten", "99_Res", "00_WikiDatein"],
	dndwikiDirName: "DnDWiki",

	dmNotesLabel: "DM NOTE",
	wikiLabel: "WIKI ENTRY",
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
		if (first.length === 0) return false;
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
		if (firstInside.length === 0) return false;

		return this.settings.globalExcludedDirNames.includes(firstInside);
	}

	private posixDirname(p: string): string {
		// Ensure consistent "/" behavior inside Obsidian
		return path.posix.dirname(p);
	}

	private normalizeWikiSortKey(originalWikiPath: string): string {
		// Equivalent to: normalized="./${f#./$dndwiki_dir_name/}"
		// In Obsidian, file paths don't start with "./", so:
		const prefix = this.settings.dndwikiDirName.replace(/\/+$/, "") + "/";
		return originalWikiPath.startsWith(prefix) ? originalWikiPath.slice(prefix.length) : originalWikiPath;
	}

	async generateSummary(): Promise<void> {
		const { vault } = this.app;

		const mdFiles = vault.getMarkdownFiles();

		const candidates: Candidate[] = [];

		// PASS 1: Collect DM Notes
		// Script: find . (prune excluded root + prune DnDWiki) -name *.md
		for (const f of mdFiles) {
			const p = f.path;

			if (this.isExcludedAtRoot(p)) continue;
			if (this.isUnderDir(p, this.settings.dndwikiDirName)) continue;

			candidates.push({
				sortKeyPath: p,
				originalPath: p,
				sourceLabel: this.settings.dmNotesLabel,
			});
		}

		// PASS 1b: Collect Wiki Entries
		// Script: find ./DnDWiki (prune excluded dirs inside DnDWiki) -name *.md
		for (const f of mdFiles) {
			const p = f.path;

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

		// PASS 2: Sort by sortKeyPath (LC_ALL=C sort equivalent)
		candidates.sort((a, b) => (a.sortKeyPath < b.sortKeyPath ? -1 : a.sortKeyPath > b.sortKeyPath ? 1 : 0));

		// PASS 3: Build output
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
			// Official way to overwrite contents
			await vault.modify(existing, content);
			return;
		}

		// Ensure folder exists if user set a path like "Reports/summary.txt"
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


