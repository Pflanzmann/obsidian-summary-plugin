import { App, TFile, normalizePath } from "obsidian";
import { VaultSummarySettings } from "../types";
import { isUnderDir } from "../utils";

export function resolveStartFiles(
	app: App,
	settings: VaultSummarySettings,
	startFile: TFile
): TFile[] {
	// 1. Check Toggle
	if (!settings.enableMirroring) return [startFile];

	const startFiles: TFile[] = [startFile];

	// findMirrorFile natively handles finding the counterpart
	// for BOTH Primary->Mirror AND Mirror->Primary
	const counterpart = findMirrorFile(app, startFile, settings);
	if (counterpart) {
		startFiles.push(counterpart);
	}

	return startFiles;
}

export function expandWithMirrors(
	app: App,
	settings: VaultSummarySettings,
	files: TFile[]
): TFile[] {
	// 1. Check Toggle
	if (!settings.enableMirroring) return files;
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
	// 1. Check Toggle
	if (!settings.enableMirroring) return null;

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
