import { App, TFile, normalizePath } from "obsidian";
import { Candidate, WikiSummarySettings } from "./types";
import {
	isExcludedFilePath,
	isExcludedAtRoot,
	isUnderDir,
	isExcludedInsideDndWiki,
	normalizeWikiSortKey,
	posixDirname
} from "./utils";

export async function generateSummary(app: App, settings: WikiSummarySettings): Promise<void> {
	const { vault } = app;
	const mdFiles = vault.getMarkdownFiles();
	const candidates: Candidate[] = [];

	// DM Notes
	for (const f of mdFiles) {
		const p = normalizePath(f.path);

		if (isExcludedFilePath(p, settings)) continue;
		if (isExcludedAtRoot(p, settings)) continue;
		if (isUnderDir(p, settings.dndwikiDirName)) continue;

		candidates.push({
			sortKeyPath: p,
			originalPath: p,
			sourceLabel: settings.dmNotesLabel,
		});
	}

	// Wiki Entries
	for (const f of mdFiles) {
		const p = normalizePath(f.path);

		if (isExcludedFilePath(p, settings)) continue;
		if (!isUnderDir(p, settings.dndwikiDirName)) continue;
		if (isExcludedInsideDndWiki(p, settings)) continue;

		candidates.push({
			sortKeyPath: normalizeWikiSortKey(p, settings),
			originalPath: p,
			sourceLabel: settings.wikiLabel,
		});
	}

	if (candidates.length === 0) {
		await writeOutput(app, settings.outputFilePath, "(Keine relevanten Dateien gefunden)\n");
		return;
	}

	candidates.sort((a, b) =>
		a.sortKeyPath < b.sortKeyPath ? -1 : a.sortKeyPath > b.sortKeyPath ? 1 : 0
	);

	let out = "";
	let currentDir = "";

	for (const c of candidates) {
		const dir = posixDirname(c.sortKeyPath);

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

	await writeOutput(app, settings.outputFilePath, out);
}

async function writeOutput(app: App, filePath: string, content: string): Promise<void> {
	const { vault } = app;
	const targetPath = normalizePath(filePath);

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
