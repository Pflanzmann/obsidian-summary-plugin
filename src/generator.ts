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

	// No specific source folder list for global generation
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

	// 1. Identify Source Files (Files inside the selected folder)
	const sourceFiles = vault.getMarkdownFiles().filter(f =>
		f.path === scanDir || f.path.startsWith(scanDir + "/")
	);

	if (sourceFiles.length === 0) {
		new Notice(`No markdown files found in folder: ${scanDir}`);
		return;
	}

	// 2. Recursive Link Discovery (Controlled by settings.scanDepth)
	const processedPathsForLinks = new Set<string>();
	const foundLinkFilesMap = new Map<string, TFile>();

	// Initialize queue
	let queue: { file: TFile; depth: number }[] = sourceFiles.map(f => ({ file: f, depth: 0 }));

	// Mark source files as processed so they aren't re-added as "links"
	sourceFiles.forEach(f => processedPathsForLinks.add(f.path));

	while (queue.length > 0) {
		const { file: currentFile, depth } = queue.shift()!;

		// If we reached the user-configured depth, we stop looking for new links
		// inside the current file.
		if (depth >= settings.scanDepth) continue;

		const cache = metadataCache.getFileCache(currentFile);
		if (!cache) continue;

		const links = [...(cache.links || []), ...(cache.embeds || [])];

		for (const link of links) {
			const targetFile = metadataCache.getFirstLinkpathDest(link.link, currentFile.path);

			if (targetFile instanceof TFile && targetFile.extension === "md") {
				if (!processedPathsForLinks.has(targetFile.path)) {
					processedPathsForLinks.add(targetFile.path);
					foundLinkFilesMap.set(targetFile.path, targetFile);

					// Add to queue for deeper scanning
					queue.push({ file: targetFile, depth: depth + 1 });
				}
			}
		}
	}

	const targetFiles = Array.from(foundLinkFilesMap.values());

	// 3. Match Logic & Candidate Creation
	const allCandidates: Candidate[] = [];
	const addedCandidatePaths = new Set<string>();

	// Helper to process a list of files and their mirrors
	const processFileBatch = (files: TFile[], isRoot: boolean) => {
		for (const file of files) {
			// A. Add the file itself
			addCandidateIfNew(file, isRoot);

			// B. Check for Mirror (Shadow) file in DnDWiki
			const mirror = findDnDWikiMirror(app, file, settings);
			if (mirror) {
				addCandidateIfNew(mirror, isRoot);
			}
		}
	};

	const addCandidateIfNew = (file: TFile, isRoot: boolean) => {
		if (addedCandidatePaths.has(file.path)) return;

		const cList = createCandidates([file], settings);
		cList.forEach(c => {
			addedCandidatePaths.add(c.originalPath);
			c.isRoot = isRoot;
			allCandidates.push(c);
		});
	};

	// Add Source Files (from the folder)
	processFileBatch(sourceFiles, true);

	// Add Linked Files (found via recursion)
	processFileBatch(targetFiles, false);

	if (allCandidates.length === 0) {
		const folderName = scanDir.split('/').pop() || "Folder";
		new Notice(`No relevant files found for ${folderName}`);
		return;
	}

	// 4. Determine Dynamic Output Path
	const folderName = scanDir.split('/').pop() || "Folder";
	const settingsDir = posixDirname(settings.outputFilePath);
	const baseDir = settingsDir === "." ? "" : settingsDir + "/";
	const dynamicOutputPath = `${baseDir}Wiki Summary - ${folderName}.txt`;

	await processAndWrite(app, allCandidates, settings, dynamicOutputPath);
}

// --- Shared Logic ---

function findDnDWikiMirror(app: App, file: TFile, settings: WikiSummarySettings): TFile | null {
	if (isUnderDir(file.path, settings.dndwikiDirName)) return null;

	const wikiPath = normalizePath(`${settings.dndwikiDirName}/${file.path}`);
	const wikiFile = app.vault.getAbstractFileByPath(wikiPath);

	return (wikiFile instanceof TFile && wikiFile.extension === "md") ? wikiFile : null;
}

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
	destinationPath: string
): Promise<void> {
	if (candidates.length === 0) {
		await writeOutput(app, destinationPath, "(Keine relevanten Dateien gefunden)\n");
		return;
	}

	// Sort: Root files first, then alphabetical by path
	candidates.sort((a, b) => {
		const aRoot = a.isRoot ? 1 : 0;
		const bRoot = b.isRoot ? 1 : 0;
		if (aRoot !== bRoot) return bRoot - aRoot;
		return a.sortKeyPath.localeCompare(b.sortKeyPath);
	});

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
