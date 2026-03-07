import { App, TFile, normalizePath } from "obsidian";
import { VaultSummarySettings, RunConfig } from "../types";
import { generateDynamicPath, isExcludedFilePath, isFolderExcluded } from "../utils";

// Sub-modules
import { runBFS, BFSResult } from "./graph";
import { resolveStartFiles, expandWithMirrors } from "./mirror";
import { createCandidates, processAndWrite } from "./writer";

// --- Public API ---

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

	// Include mandatory and bypass exclusions
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

/**
 * Orchestrates BFS and Mirror expansion for a single file.
 */
export function getIncludedFiles(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile,
	config: RunConfig
): BFSResult {

	// 1. Resolve effective start files (handle mirror <-> primary swap)
	const startFiles = resolveStartFiles(app, settings, startFile);

	// 2. Run BFS (Pass settings for backlink logic)
	const bfsResult = runBFS(app, startFiles, config, settings);

	// 3. Expand results with mirrors
	const expandedStart = expandWithMirrors(app, settings, bfsResult.startFiles);
	const expandedOthers = expandWithMirrors(app, settings, bfsResult.others);

	return { startFiles: expandedStart, others: expandedOthers };
}

/**
 * Orchestrates BFS and Mirror expansion for a folder.
 */
export function getIncludedFilesForFolder(
	app: App,
	settings: VaultSummarySettings,
	folderPath: string,
	config: RunConfig
): BFSResult {

	const { vault } = app;
	const scanDir = normalizePath(folderPath);

	const startFiles = vault.getMarkdownFiles().filter(f =>
		f.path === scanDir || f.path.startsWith(scanDir + "/")
	);

	// Pass settings for backlink logic
	const bfsResult = runBFS(app, startFiles, config, settings);

	const expandedStart = expandWithMirrors(app, settings, bfsResult.startFiles);
	const expandedOthers = expandWithMirrors(app, settings, bfsResult.others);

	return { startFiles: expandedStart, others: expandedOthers };
}
