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

	// Use settings path exactly as is for full vault
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

	const { startFiles, others } = calculateIncludedFilesForFolder(app, settings, folderPath, config);
	const allCandidates = buildCandidateList(app, settings, startFiles, others);

	const folderName = folderPath.split('/').pop() || "Folder";

	if (allCandidates.length === 0) {
		new Notice(`No relevant files found for ${folderName}`);
		return;
	}

	// Use settings path as base, append " - {FolderName}"
	const outputPath = generateDynamicPath(settings.outputFilePath, folderName);

	await processAndWrite(app, allCandidates, settings, outputPath);
}

// --- 3. Single File Mode ---

export async function generateSummaryFromFile(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): Promise<void> {

	const { startFiles, others } = calculateIncludedFiles(app, settings, startFile, config);
	const allCandidates = buildCandidateList(app, settings, startFiles, others);

	// Use settings path as base, append " - {FileName}"
	const outputPath = generateDynamicPath(settings.outputFilePath, startFile.basename);

	await processAndWrite(app, allCandidates, settings, outputPath);
}

// --- 4. Calculation Logic (BFS) ---

export function calculateIncludedFiles(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): { startFiles: TFile[], others: TFile[] } {

	const { vault } = app;
	const startFiles: TFile[] = [startFile];

	// Handle Mirror check for the start file
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
		if (mirror) startFiles.push(mirror);
	}

	return runBFS(app, startFiles, config);
}

export function calculateIncludedFilesForFolder(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string,
	config: RunConfig
): { startFiles: TFile[], others: TFile[] } {

	const { vault } = app;
	const scanDir = normalizePath(folderPath);

	// Get all markdown files in the folder (including subfolders)
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

	let queue: { file: TFile; depth: number }[] = roots.map(f => ({ file: f, depth: 1 }));

	roots.forEach(f => {
		processedPaths.add(f.path);
		collectedFilesMap.set(f.path, f);
	});

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

		// B. Process Incoming (Backlinks)
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

// --- 5. Preview Counters ---

export function getPreviewCount(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): number {
	const { startFiles, others } = calculateIncludedFiles(app, settings, startFile, config);
	const candidates = buildCandidateList(app, settings, startFiles, others);
	return candidates.length;
}

export function getPreviewCountForFolder(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string,
	config: RunConfig
): number {
	const { startFiles, others } = calculateIncludedFilesForFolder(app, settings, folderPath, config);
	const candidates = buildCandidateList(app, settings, startFiles, others);
	return candidates.length;
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
		if (isFolderExcluded(p, settings)) continue;

		if (isUnderDir(p, settings.mirrorFolderPath)) {
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
