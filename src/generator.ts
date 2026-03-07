import { App, TFile, normalizePath, Notice } from "obsidian";
import { Candidate, VaultSummarySettings, RunConfig } from "./types";
import {
	isExcludedFilePath,
	isFolderExcluded,
	isUnderDir,
	normalizeMirrorSortKey,
	generateDynamicPath
} from "./utils";
import { resolveStartFiles } from "./generator/mirror";



export async function generateSummary(app: App, settings: VaultSummarySettings): Promise<void> {
	const { vault } = app;
	const allFiles = vault.getMarkdownFiles();

	const mandatoryRoots: TFile[] = [];
	const mandatoryLinks: TFile[] = [];

	settings.alwaysIncludePathsAsRoots.forEach(path => {
		const file = vault.getAbstractFileByPath(normalizePath(path));
		if (file instanceof TFile && file.extension === "md") {
			mandatoryRoots.push(...resolveStartFiles(app, settings, file));
		}
	});

	settings.alwaysIncludePathsAsLinks.forEach(path => {
		const file = vault.getAbstractFileByPath(normalizePath(path));
		if (file instanceof TFile && file.extension === "md") {
			mandatoryLinks.push(...resolveStartFiles(app, settings, file));
		}
	});

	const uniqueFilesMap = new Map<string, TFile>();

	mandatoryRoots.forEach(f => uniqueFilesMap.set(normalizePath(f.path), f));
	mandatoryLinks.forEach(f => uniqueFilesMap.set(normalizePath(f.path), f));

	allFiles.forEach(f => {
		const normPath = normalizePath(f.path);
		if (!uniqueFilesMap.has(normPath)) {
			if (!isExcludedFilePath(normPath, settings) && !isFolderExcluded(normPath, settings)) {
				uniqueFilesMap.set(normPath, f);
			}
		}
	});

	const finalFileList = Array.from(uniqueFilesMap.values());

	const uniqueRootsMap = new Map<string, TFile>();
	mandatoryRoots.forEach(f => uniqueRootsMap.set(normalizePath(f.path), f));
	const deduplicatedRoots = Array.from(uniqueRootsMap.values());

	const candidates = createCandidates(finalFileList, settings, deduplicatedRoots);

	const outputPath = generateDynamicPath(settings.outputFilePath, null);
	await processAndWrite(app, candidates, settings, outputPath);
}



export async function generateSummaryFromLinks(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string,
	config: RunConfig
): Promise<void> {
	const files = getIncludedFilesForFolder(app, settings, folderPath, config);

	const rootPaths = new Set(files.startFiles.map(f => normalizePath(f.path)));
	const allFiles = [...files.startFiles, ...files.others].filter(f => {
		const normPath = normalizePath(f.path);
		if (rootPaths.has(normPath)) return true;
		if (isExcludedFilePath(normPath, settings)) return false;
		if (isFolderExcluded(normPath, settings)) return false;
		return true;
	});

	const folderName = folderPath.split('/').pop() || "Folder";

	await generateSummaryFromFiles(app, settings, allFiles, folderName, files.startFiles);
}


export async function generateSummaryFromFile(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): Promise<void> {
	const files = getIncludedFiles(app, settings, startFile, config);

	const rootPaths = new Set(files.startFiles.map(f => normalizePath(f.path)));
	const allFiles = [...files.startFiles, ...files.others].filter(f => {
		const normPath = normalizePath(f.path);
		if (rootPaths.has(normPath)) return true;
		if (isExcludedFilePath(normPath, settings)) return false;
		if (isFolderExcluded(normPath, settings)) return false;
		return true;
	});

	await generateSummaryFromFiles(app, settings, allFiles, startFile.basename, files.startFiles);
}


export async function generateSummaryFromFiles(
	app: App,
	settings: VaultSummarySettings,
	files: TFile[],
	sourceName: string,
	rootFiles: TFile[] = []
): Promise<void> {

	const candidates = createCandidates(files, settings, rootFiles);
	const outputPath = generateDynamicPath(settings.outputFilePath, sourceName);
	await processAndWrite(app, candidates, settings, outputPath);
}


export function getIncludedFiles(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): { startFiles: TFile[], others: TFile[] } {

	const { vault } = app;
	const startFiles: TFile[] = [startFile];
	const mirrorDir = settings.mirrorFolderPath.trim();

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

	const bfsResult = runBFS(app, startFiles, config, settings);

	const expandedStart = expandWithMirrors(app, settings, bfsResult.startFiles);
	const expandedOthers = expandWithMirrors(app, settings, bfsResult.others);

	return { startFiles: expandedStart, others: expandedOthers };
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

	const bfsResult = runBFS(app, startFiles, config, settings);

	const expandedStart = expandWithMirrors(app, settings, bfsResult.startFiles);
	const expandedOthers = expandWithMirrors(app, settings, bfsResult.others);

	return { startFiles: expandedStart, others: expandedOthers };
}

function expandWithMirrors(app: App, settings: VaultSummarySettings, files: TFile[]): TFile[] {
	if (!settings.mirrorFolderPath.trim()) return files;

	const result = [...files];
	const existingPaths = new Set(files.map(f => f.path));

	for (const f of files) {
		const mirror = findMirrorFile(app, f, settings);
		if (mirror && !existingPaths.has(mirror.path)) {
			result.push(mirror);
			existingPaths.add(mirror.path);
		}
	}
	return result;
}

function runBFS(
	app: App,
	roots: TFile[],
	config: RunConfig,
	settings: VaultSummarySettings
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

		if (config.includeBacklinks && globalBacklinkMap) {
			const allowBacklinks = !settings.backlinksOnRootOnly || depth === 1;

			if (allowBacklinks) {
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
	}

	const rootPaths = new Set(roots.map(f => f.path));
	const others = Array.from(collectedFilesMap.values()).filter(f => !rootPaths.has(f.path));

	return { startFiles: roots, others };
}


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

function findMirrorFile(app: App, file: TFile, settings: VaultSummarySettings): TFile | null {
	const mirrorDir = settings.mirrorFolderPath.trim();
	if (!mirrorDir) return null;

	if (isUnderDir(file.path, mirrorDir)) {
		const mirrorPrefix = mirrorDir.replace(/\/+$/, "") + "/";
		if (file.path.startsWith(mirrorPrefix)) {
			const primaryPath = file.path.slice(mirrorPrefix.length);
			const primaryFile = app.vault.getAbstractFileByPath(primaryPath);
			if (primaryFile instanceof TFile && primaryFile.extension === "md") return primaryFile;
		}
		return null;
	}

	const mirrorPath = normalizePath(`${mirrorDir}/${file.path}`);
	const mirrorFile = app.vault.getAbstractFileByPath(mirrorPath);

	return (mirrorFile instanceof TFile && mirrorFile.extension === "md") ? mirrorFile : null;
}

function createCandidates(
	files: TFile[],
	settings: VaultSummarySettings,
	rootFiles: TFile[]
): Candidate[] {
	const candidates: Candidate[] = [];
	const mirrorDir = settings.mirrorFolderPath.trim();
	const mirrorActive = mirrorDir.length > 0;

	const rootSortKeys = new Set<string>();
	for (const r of rootFiles) {
		rootSortKeys.add(normalizeMirrorSortKey(r.path, settings));
	}

	for (const f of files) {
		const p = normalizePath(f.path);

		const sortKey = normalizeMirrorSortKey(p, settings);
		const isRoot = rootSortKeys.has(sortKey);


		let c: Candidate;

		if (mirrorActive && isUnderDir(p, mirrorDir)) {
			c = {
				sortKeyPath: sortKey,
				originalPath: p,
				sourceLabel: settings.mirrorLabel,
			};
		} else {
			c = {
				sortKeyPath: p,
				originalPath: p,
				sourceLabel: mirrorActive ? settings.primaryLabel : "",
			};
		}

		if (isRoot) {
			c.isRoot = true;
		}

		candidates.push(c);
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

		const cmp = a.sortKeyPath.localeCompare(b.sortKeyPath);
		if (cmp !== 0) return cmp;

		if (a.sourceLabel === settings.primaryLabel && b.sourceLabel === settings.mirrorLabel) return -1;
		if (b.sourceLabel === settings.primaryLabel && a.sourceLabel === settings.mirrorLabel) return 1;

		return a.originalPath.localeCompare(b.originalPath);
	});

	let out = "";

	for (const c of candidates) {
		out += `### FILE: ${c.originalPath}\n`;
		if (c.sourceLabel) out += `> Source: ${c.sourceLabel}\n`;
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
