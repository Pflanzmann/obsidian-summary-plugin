import { App, TFile, normalizePath } from "obsidian";
import { VaultSummarySettings, RunConfig } from "../types";
import { generateDynamicPath } from "../utils";

// Sub-modules
import { runBFS, BFSResult } from "./graph";
import { resolveStartFiles, expandWithMirrors } from "./mirror";
import { createCandidates, processAndWrite } from "./writer";

// --- Public API ---

export async function generateSummary(app: App, settings: VaultSummarySettings): Promise<void> {
	const { vault } = app;
	const allFiles = vault.getMarkdownFiles();
	// For "All Vault", no specific roots to prioritize
	const candidates = createCandidates(allFiles, settings, []);

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

	// 2. Run BFS
	const bfsResult = runBFS(app, startFiles, config);

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

	const bfsResult = runBFS(app, startFiles, config);

	const expandedStart = expandWithMirrors(app, settings, bfsResult.startFiles);
	const expandedOthers = expandWithMirrors(app, settings, bfsResult.others);

	return { startFiles: expandedStart, others: expandedOthers };
}
