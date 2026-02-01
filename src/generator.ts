import { App, TFile, normalizePath, Notice } from "obsidian";
import { Candidate, WikiSummarySettings } from "./types";
import {
	isExcludedFilePath,
	isExcludedAtRoot,
	isUnderDir,
	isExcludedInsideDndWiki,
	normalizeWikiSortKey,
	posixDirname
} from "./utils";

// --- 1. Standard Generation (All Vault) ---

export async function generateSummary(app: App, settings: WikiSummarySettings): Promise<void> {
	const { vault } = app;
	const allFiles = vault.getMarkdownFiles();

	const candidates = createCandidates(allFiles, settings);

	// Use the fixed path from settings
	await processAndWrite(app, candidates, settings, settings.outputFilePath);
}

// --- 2. Link-Based Generation (Passed Folder) ---

export async function generateSummaryFromLinks(
	app: App,
	settings: WikiSummarySettings,
	folderPath: string
): Promise<void> {
	const { vault, metadataCache } = app;
	const scanDir = normalizePath(folderPath);

	// 1. Identify Source Files
	const sourceFiles = vault.getMarkdownFiles().filter(f =>
		f.path === scanDir || f.path.startsWith(scanDir + "/")
	);

	if (sourceFiles.length === 0) {
		new Notice(`No markdown files found in folder: ${scanDir}`);
		return;
	}

	// 2. Recursive Link Discovery
	const MAX_DEPTH = 2;
	const processedPaths = new Set<string>();
	const foundFilesMap = new Map<string, TFile>();

	// Initialize queue
	let queue: { file: TFile; depth: number }[] = sourceFiles.map(f => ({ file: f, depth: 0 }));
	sourceFiles.forEach(f => processedPaths.add(f.path));

	while (queue.length > 0) {
		const { file: currentFile, depth } = queue.shift()!;

		if (depth >= MAX_DEPTH) continue;

		const cache = metadataCache.getFileCache(currentFile);
		if (!cache) continue;

		const links = [...(cache.links || []), ...(cache.embeds || [])];

		for (const link of links) {
			const targetFile = metadataCache.getFirstLinkpathDest(link.link, currentFile.path);

			if (targetFile instanceof TFile && targetFile.extension === "md") {
				if (!processedPaths.has(targetFile.path)) {
					processedPaths.add(targetFile.path);
					foundFilesMap.set(targetFile.path, targetFile);
					queue.push({ file: targetFile, depth: depth + 1 });
				}
			}
		}
	}

	const targetFiles = Array.from(foundFilesMap.values());

	if (targetFiles.length === 0) {
		new Notice(`No links found starting from ${scanDir}`);
		return;
	}

	// 3. Determine Dynamic Output Path
	// Get the folder name (e.g. "00_Sessions/Chapter 1" -> "Chapter 1")
	const folderName = scanDir.split('/').pop() || "Folder";

	// Determine where to save it. We use the directory from the settings,
	// but change the filename.
	const settingsDir = posixDirname(settings.outputFilePath);
	const baseDir = settingsDir === "." ? "" : settingsDir + "/";

	// Final name: "Wiki Summary - Chapter 1.txt"
	const dynamicOutputPath = `${baseDir}Wiki Summary - ${folderName}.txt`;

	// 4. Process
	const candidates = createCandidates(targetFiles, settings);
	await processAndWrite(app, candidates, settings, dynamicOutputPath);
}

// --- Shared Logic ---

function createCandidates(files: TFile[], settings: WikiSummarySettings): Candidate[] {
	const candidates: Candidate[] = [];

	for (const f of files) {
		const p = normalizePath(f.path);

		if (isExcludedFilePath(p, settings)) continue;
		if (isExcludedAtRoot(p, settings)) continue;

		if (isUnderDir(p, settings.dndwikiDirName)) {
			if (isExcludedInsideDndWiki(p, settings)) continue;

			candidates.push({
				sortKeyPath: normalizeWikiSortKey(p, settings),
				originalPath: p,
				sourceLabel: settings.wikiLabel,
			});
		} else {
			candidates.push({
				sortKeyPath: p,
				originalPath: p,
				sourceLabel: settings.dmNotesLabel,
			});
		}
	}
	return candidates;
}

/**
 * Generates the text content and writes it to the specific output path.
 */
async function processAndWrite(
	app: App,
	candidates: Candidate[],
	settings: WikiSummarySettings,
	destinationPath: string // <--- Now accepts the specific destination
): Promise<void> {
	if (candidates.length === 0) {
		await writeOutput(app, destinationPath, "(Keine relevanten Dateien gefunden)\n");
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

		const file = app.vault.getAbstractFileByPath(c.originalPath);
		if (file instanceof TFile) {
			const content = await app.vault.cachedRead(file);
			out += content;
			if (!out.endsWith("\n")) out += "\n";
		} else {
			out += `FEHLER: Datei '${c.originalPath}' nicht gefunden.\n`;
		}

		out += "\n=============================================\n\n";
	}

	await writeOutput(app, destinationPath, out);
	new Notice(`Summary written to: ${destinationPath}`);
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
