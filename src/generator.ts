import { App, TFile, normalizePath, Notice } from "obsidian";
import { Candidate, VaultSummarySettings, RunConfig } from "./types";
import {
	isExcludedFilePath,
	isFolderExcluded,
	isUnderDir,
	normalizeMirrorSortKey,
	generateDynamicPath
} from "./utils";

// --- 1. Standard Generation (All Vault) ---

export async function generateSummary(app: App, settings: VaultSummarySettings): Promise<void> {
	const { vault } = app;
	const allFiles = vault.getMarkdownFiles();
	const candidates = createCandidates(allFiles, settings);

	const outputPath = generateDynamicPath(settings.outputFilePath, null);
	await processAndWrite(app, candidates, settings, outputPath);
}

// --- 2. Link-Based Generation (Passed Folder) ---

export async function generateSummaryFromLinks(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string,
	config: RunConfig
): Promise<void> {
	// Old entry point - loops logic. Kept for backward compatibility if needed,
	// but mostly replaced by the UI flow calling generateSummaryFromFiles
	const files = getIncludedFilesForFolder(app, settings, folderPath, config);
	const folderName = folderPath.split('/').pop() || "Folder";
	const outputPath = generateDynamicPath(settings.outputFilePath, folderName);

	const candidates = buildCandidateList(app, settings, files.startFiles, files.others);
	await processAndWrite(app, candidates, settings, outputPath);
}

// --- 3. Single File Mode ---

export async function generateSummaryFromFile(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): Promise<void> {
	// Old entry point
	const files = getIncludedFiles(app, settings, startFile, config);
	const outputPath = generateDynamicPath(settings.outputFilePath, startFile.basename);

	const candidates = buildCandidateList(app, settings, files.startFiles, files.others);
	await processAndWrite(app, candidates, settings, outputPath);
}

// --- 4. NEW: Generate from Specific List (Called by UI) ---

export async function generateSummaryFromFiles(
	app: App,
	settings: VaultSummarySettings,
	files: TFile[], // The files selected in the UI
	sourceName: string // For filename generation
): Promise<void> {

	// We treat all passed files as "candidates".
	// We re-run createCandidates to apply Mirror logic if applicable.
	const candidates = createCandidates(files, settings);

	const outputPath = generateDynamicPath(settings.outputFilePath, sourceName);
	await processAndWrite(app, candidates, settings, outputPath);
}

// --- 5. Calculation Logic (BFS) & Helpers ---

/**
 * Public helper to get the raw files for the UI preview
 */
export function getIncludedFiles(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): { startFiles: TFile[], others: TFile[] } {

	const { vault } = app;
	const startFiles: TFile[] = [startFile];
	const mirrorDir = settings.mirrorFolderPath.trim();

	// Only perform mirror logic if mirror is enabled
	if (mirrorDir) {
		if (isUnderDir(startFile.path, mirrorDir)) {
			const mirrorPrefix = mirrorDir.replace(/\/+$/, "") + "/";
			if (startFile.path.startsWith(mirrorPrefix)) {
				const primaryPath = startFile.path.slice(mirrorPrefix.length);
				const primaryFile = vault.getAbstractFileByPath(primaryPath);
				if (primaryFile instanceof TFile && primaryFile.extension === "md") {
					startFiles.push(primaryFile);
				}
			}
		} else {
			const mirror = findMirrorFile(app, startFile, settings);
			if (mirror) startFiles.push(mirror);
		}
	}

	return runBFS(app, startFiles, config);
}

export function getIncludedFilesForFolder(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string,
	config: RunConfig
): { startFiles: TFile[], others: TFile[] } {

	const { vault } = app;
	const scanDir = normalizePath(folderPath);

	const startFiles = vault.getMarkdownFiles().filter(f =>
		f.path === scanDir || f.path.startsWith(scanDir + "/")
	);

	return runBFS(app, startFiles, config);
}

function runBFS(
	app: App,
	roots: TFile[],
	config: RunConfig
): { startFiles: TFile[], others: TFile[] } {

	const { metadataCache, vault } = app;
	const processedPaths = new Set<string>();
	const collectedFilesMap = new Map<string, TFile>();

	let globalBacklinkMap: Map<string, Set<string>> | null = null;
	if (config.includeBacklinks) {
		globalBacklinkMap = buildGlobalBacklinkMap(app);
	}

	// Depth 1 includes the files themselves
	let queue: { file: TFile; depth: number }[] = roots.map(f => ({ file: f, depth: 1 }));

	roots.forEach(f => {
		processedPaths.add(f.path);
		collectedFilesMap.set(f.path, f);
	});

	while (queue.length > 0) {
		const { file: currentFile, depth } = queue.shift()!;

		if (depth > config.depth) continue;

		// A. Process Outgoing
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

		// B. Process Incoming
		if (config.includeBacklinks && globalBacklinkMap) {
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

	const rootPaths = new Set(roots.map(f => f.path));
	const others = Array.from(collectedFilesMap.values()).filter(f => !rootPaths.has(f.path));

	return { startFiles: roots, others };
}

// --- Helpers ---

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
			// Only find mirror if setting is active
			if (settings.mirrorFolderPath.trim()) {
				const mirror = findMirrorFile(app, file, settings);
				if (mirror) {
					addCandidateIfNew(mirror, isRoot);
				}
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

function findMirrorFile(app: App, file: TFile, settings: VaultSummarySettings): TFile | null {
	const mirrorDir = settings.mirrorFolderPath.trim();
	if (!mirrorDir) return null; // Safety check

	if (isUnderDir(file.path, mirrorDir)) return null;

	const mirrorPath = normalizePath(`${mirrorDir}/${file.path}`);
	const mirrorFile = app.vault.getAbstractFileByPath(mirrorPath);

	return (mirrorFile instanceof TFile && mirrorFile.extension === "md") ? mirrorFile : null;
}

function createCandidates(files: TFile[], settings: VaultSummarySettings): Candidate[] {
	const candidates: Candidate[] = [];
	const mirrorDir = settings.mirrorFolderPath.trim();
	const mirrorActive = mirrorDir.length > 0;

	for (const f of files) {
		const p = normalizePath(f.path);

		if (isExcludedFilePath(p, settings)) continue;
		if (isFolderExcluded(p, settings)) continue;

		if (mirrorActive && isUnderDir(p, mirrorDir)) {
			// It is a mirror file
			candidates.push({
				sortKeyPath: normalizeMirrorSortKey(p, settings),
				originalPath: p,
				sourceLabel: settings.mirrorLabel,
			});
		} else {
			// It is a standard/primary file
			candidates.push({
				sortKeyPath: p,
				originalPath: p,
				// If mirror is inactive, sourceLabel is empty string
				sourceLabel: mirrorActive ? settings.primaryLabel : "",
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

		// Only write Source line if label exists (i.e. Mirroring is ON)
		if (c.sourceLabel) {
			out += `> Source: ${c.sourceLabel}\n`;
		}

		out += `\n`;

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
