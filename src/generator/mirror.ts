import { App, TFile, normalizePath } from "obsidian";
import { VaultSummarySettings } from "../types";
import { isUnderDir } from "../utils";

/**
 * Checks if the starting file is a mirror file.
 * If it is, tries to swap it for the primary file.
 * If it is a primary file, looks for its mirror to add to the list.
 */
export function resolveStartFiles(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile
): TFile[] {
	const { vault } = app;
	const startFiles: TFile[] = [startFile];
	const mirrorDir = settings.mirrorFolderPath.trim();

	if (!mirrorDir) return startFiles;

	if (isUnderDir(startFile.path, mirrorDir)) {
		// Case A: We started on a file INSIDE the mirror folder.
		// We want to crawl the Primary file instead (usually).
		const mirrorPrefix = mirrorDir.replace(/\/+$/, "") + "/";
		if (startFile.path.startsWith(mirrorPrefix)) {
			const primaryPath = startFile.path.slice(mirrorPrefix.length);
			const primaryFile = vault.getAbstractFileByPath(primaryPath);
			if (primaryFile instanceof TFile && primaryFile.extension === "md") {
				// We found the primary source. Use that as the root for BFS.
				// We usually discard the mirror start file in favor of the primary
				// because expandWithMirrors will add the mirror back later.
				return [primaryFile];
			}
		}
	} else {
		// Case B: We started on a normal file.
		// Check if it has a mirror counterpart immediately.
		const mirror = findMirrorFile(app, startFile, settings);
		if (mirror) startFiles.push(mirror);
	}

	return startFiles;
}

/**
 * Takes a list of files (found via BFS) and adds their mirror counterparts
 * if they exist and aren't already in the list.
 */
export function expandWithMirrors(
	app: App,
	settings: VaultSummarySettings,
	files: TFile[]
): TFile[] {
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

export function findMirrorFile(
	app: App,
	file: TFile,
	settings: VaultSummarySettings
): TFile | null {
	const mirrorDir = settings.mirrorFolderPath.trim();
	if (!mirrorDir) return null;

	// If file is already in mirror dir, find primary
	if (isUnderDir(file.path, mirrorDir)) {
		const mirrorPrefix = mirrorDir.replace(/\/+$/, "") + "/";
		if (file.path.startsWith(mirrorPrefix)) {
			const primaryPath = file.path.slice(mirrorPrefix.length);
			const primaryFile = app.vault.getAbstractFileByPath(primaryPath);
			if (primaryFile instanceof TFile && primaryFile.extension === "md") return primaryFile;
		}
		return null;
	}

	// If file is primary, find mirror
	const mirrorPath = normalizePath(`${mirrorDir}/${file.path}`);
	const mirrorFile = app.vault.getAbstractFileByPath(mirrorPath);

	return (mirrorFile instanceof TFile && mirrorFile.extension === "md") ? mirrorFile : null;
}
