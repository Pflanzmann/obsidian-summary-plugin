import { App, TFile, normalizePath, Notice } from "obsidian";
import { Candidate, VaultSummarySettings, SingleFileRunConfig } from "./types";
import {
	isExcludedFilePath,
	isFolderExcluded,
	isUnderDir,
	normalizeMirrorSortKey,
	posixDirname
} from "./utils";

// --- 1. Standard Generation (All Vault) ---

export async function generateSummary(app: App, settings: VaultSummarySettings): Promise<void> {
	const { vault } = app;
	const allFiles = vault.getMarkdownFiles();
	const candidates = createCandidates(allFiles, settings);
	await processAndWrite(app, candidates, settings, settings.outputFilePath);
}

// --- 2. Link-Based Generation (Passed Folder) ---

export async function generateSummaryFromLinks(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string
): Promise<void> {
	const { vault, metadataCache } = app;
	const scanDir = normalizePath(folderPath);

	const sourceFiles = vault.getMarkdownFiles().filter(f =>
		f.path === scanDir || f.path.startsWith(scanDir + "/")
	);

	if (sourceFiles.length === 0) {
		new Notice(`No markdown files found in folder: ${scanDir}`);
		return;
	}

	const processedPathsForLinks = new Set<string>();
	const foundLinkFilesMap = new Map<string, TFile>();

	let queue: { file: TFile; depth: number }[] = sourceFiles.map(f => ({ file: f, depth: 0 }));
	sourceFiles.forEach(f => processedPathsForLinks.add(f.path));

	while (queue.length > 0) {
		const { file: currentFile, depth } = queue.shift()!;

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
					queue.push({ file: targetFile, depth: depth + 1 });
				}
			}
		}
	}

	const targetFiles = Array.from(foundLinkFilesMap.values());
	const allCandidates = buildCandidateList(app, settings, sourceFiles, targetFiles);

	if (allCandidates.length === 0) {
		const folderName = scanDir.split('/').pop() || "Folder";
		new Notice(`No relevant files found for ${folderName}`);
		return;
	}

	const folderName = scanDir.split('/').pop() || "Folder";
	const settingsDir = posixDirname(settings.outputFilePath);
	const baseDir = settingsDir === "." ? "" : settingsDir + "/";
	const dynamicOutputPath = `${baseDir}Summary - ${folderName}.txt`;

	await processAndWrite(app, allCandidates, settings, dynamicOutputPath);
}

// --- 3. Single File Mode (NEW) ---

export async function generateSummaryFromFile(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: SingleFileRunConfig
): Promise<void> {
	const { metadataCache, vault } = app;

	const processedPaths = new Set<string>();
	const collectedFilesMap = new Map<string, TFile>();

	// 0. Pre-calculate Backlinks Map if needed
	let globalBacklinkMap: Map<string, Set<string>> | null = null;
	if (config.includeBacklinks) {
		globalBacklinkMap = buildGlobalBacklinkMap(app);
	}

	// 1. Identify Start Nodes (Primary AND Mirror)
	const startFiles: TFile[] = [startFile];

	if (isUnderDir(startFile.path, settings.mirrorFolderPath)) {
		const mirrorPrefix = settings.mirrorFolderPath.replace(/\/+$/, "") + "/";
		if (startFile.path.startsWith(mirrorPrefix)) {
			const primaryPath = startFile.path.slice(mirrorPrefix.length);
			const primaryFile = vault.getAbstractFileByPath(primaryPath);
			if (primaryFile instanceof TFile && primaryFile.extension === "md") {
				startFiles.push(primaryFile);
			}
		}
	} else {
		const mirror = findMirrorFile(app, startFile, settings);
		if (mirror) {
			startFiles.push(mirror);
		}
	}

	// 2. Initialize Queue
	let queue: { file: TFile; depth: number }[] = startFiles.map(f => ({ file: f, depth: 1 }));

	startFiles.forEach(f => {
		processedPaths.add(f.path);
		collectedFilesMap.set(f.path, f);
	});

	// 3. Run BFS
	while (queue.length > 0) {
		const { file: currentFile, depth } = queue.shift()!;

		if (depth > config.depth) continue;

		// A. Process Outgoing (Mentions)
		if (config.includeMentions) {
			const cache = metadataCache.getFileCache(currentFile);
			if (cache) {
				const links = [...(cache.links || []), ...(cache.embeds || [])];
				for (const link of links) {
					const target = metadataCache.getFirstLinkpathDest(link.link, currentFile.path);
					if (target instanceof TFile && target.extension === "md") {
						if (!processedPaths.has(target.path)) {
							processedPaths.add(target.path);
							collectedFilesMap.set(target.path, target);
							queue.push({ file: target, depth: depth + 1 });
						}
					}
				}
			}
		}

		// B. Process Incoming (Backlinks) - Start Files Only
		if (config.includeBacklinks && globalBacklinkMap && depth === 1) {
			const sources = globalBacklinkMap.get(currentFile.path);
			if (sources) {
				for (const sourcePath of sources) {
					const sourceFile = vault.getAbstractFileByPath(sourcePath);
					if (sourceFile instanceof TFile && sourceFile.extension === "md") {
						if (!processedPaths.has(sourceFile.path)) {
							processedPaths.add(sourceFile.path);
							collectedFilesMap.set(sourceFile.path, sourceFile);
							queue.push({ file: sourceFile, depth: depth + 1 });
						}
					}
				}
			}
		}
	}

	// 4. Build Output
	const startPaths = new Set(startFiles.map(f => f.path));
	const others = Array.from(collectedFilesMap.values()).filter(f => !startPaths.has(f.path));

	const allCandidates = buildCandidateList(app, settings, startFiles, others);

	const settingsDir = posixDirname(settings.outputFilePath);
	const baseDir = settingsDir === "." ? "" : settingsDir + "/";
	const dynamicOutputPath = `${baseDir}Summary - ${startFile.basename}.txt`;

	await processAndWrite(app, allCandidates, settings, dynamicOutputPath);
}

// --- Helper: Build Global Backlink Map ---
function buildGlobalBacklinkMap(app: App): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	const allFiles = app.vault.getMarkdownFiles();
	const { metadataCache } = app;

	for (const sourceFile of allFiles) {
		const cache = metadataCache.getFileCache(sourceFile);
		if (!cache) continue;

		const links = [...(cache.links || []), ...(cache.embeds || [])];

		for (const link of links) {
			const targetFile = metadataCache.getFirstLinkpathDest(link.link, sourceFile.path);

			if (targetFile instanceof TFile) {
				if (!map.has(targetFile.path)) {
					map.set(targetFile.path, new Set());
				}
				map.get(targetFile.path)?.add(sourceFile.path);
			}
		}
	}
	return map;
}

// --- Helper: Build Candidate List (Mirrors + Exclusions) ---

function buildCandidateList(
	app: App,
	settings: VaultSummarySettings,
	roots: TFile[],
	others: TFile[]
): Candidate[] {
	const allCandidates: Candidate[] = [];
	const addedCandidatePaths = new Set<string>();

	const processBatch = (files: TFile[], isRoot: boolean) => {
		for (const file of files) {
			addCandidateIfNew(file, isRoot);
			const mirror = findMirrorFile(app, file, settings);
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

	processBatch(roots, true);
	processBatch(others, false);

	return allCandidates;
}

// --- Shared Logic ---

function findMirrorFile(app: App, file: TFile, settings: VaultSummarySettings): TFile | null {
	if (isUnderDir(file.path, settings.mirrorFolderPath)) return null;

	const mirrorPath = normalizePath(`${settings.mirrorFolderPath}/${file.path}`);
	const mirrorFile = app.vault.getAbstractFileByPath(mirrorPath);

	return (mirrorFile instanceof TFile && mirrorFile.extension === "md") ? mirrorFile : null;
}

function createCandidates(files: TFile[], settings: VaultSummarySettings): Candidate[] {
	const candidates: Candidate[] = [];

	for (const f of files) {
		const p = normalizePath(f.path);

		if (isExcludedFilePath(p, settings)) continue;

		// NEW: Use the robust folder exclusion check
		if (isFolderExcluded(p, settings)) continue;

		if (isUnderDir(p, settings.mirrorFolderPath)) {
			// Note: isFolderExcluded handles mirror-relative exclusion now.
			// so we just check if it's the mirror folder itself or a valid file.
			candidates.push({
				sortKeyPath: normalizeMirrorSortKey(p, settings),
				originalPath: p,
				sourceLabel: settings.mirrorLabel,
			});
		} else {
			candidates.push({
				sortKeyPath: p,
				originalPath: p,
				sourceLabel: settings.primaryLabel,
			});
		}
	}
	return candidates;
}

async function processAndWrite(
	app: App,
	candidates: Candidate[],
	settings: VaultSummarySettings,
	destinationPath: string
): Promise<void> {
	if (candidates.length === 0) {
		await writeOutput(app, destinationPath, "(No relevant files found)\n");
		return;
	}

	candidates.sort((a, b) => {
		const aRoot = a.isRoot ? 1 : 0;
		const bRoot = b.isRoot ? 1 : 0;
		if (aRoot !== bRoot) return bRoot - aRoot;
		return a.sortKeyPath.localeCompare(b.sortKeyPath);
	});

	let out = "";

	for (const c of candidates) {
		out += `### FILE: ${c.originalPath}\n`;
		out += `> Source: ${c.sourceLabel}\n\n`;

		const file = app.vault.getAbstractFileByPath(c.originalPath);

		out += "````markdown\n";

		if (file instanceof TFile) {
			const content = await app.vault.cachedRead(file);
			out += content;
			if (!out.endsWith("\n")) out += "\n";
		} else {
			out += `ERROR: File '${c.originalPath}' not found.\n`;
		}

		out += "````\n\n";
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
