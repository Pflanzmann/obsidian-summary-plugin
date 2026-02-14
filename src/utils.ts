import { normalizePath } from "obsidian";
import { VaultSummarySettings } from "./types";

// --- Path & Directory Helpers ---

export function posixDirname(p: string): string {
	const s = normalizePath(p);
	const idx = s.lastIndexOf("/");
	if (idx === -1) return ".";
	if (idx === 0) return "/";
	return s.slice(0, idx);
}

export function generateDynamicPath(basePath: string, suffix: string | null): string {
	if (!suffix) return normalizePath(basePath);

	const normalized = normalizePath(basePath);
	const lastDotIndex = normalized.lastIndexOf(".");
	const lastSlashIndex = normalized.lastIndexOf("/");

	if (lastDotIndex > lastSlashIndex) {
		const pathWithoutExt = normalized.substring(0, lastDotIndex);
		const ext = normalized.substring(lastDotIndex);
		return `${pathWithoutExt} - ${suffix}${ext}`;
	} else {
		return `${normalized} - ${suffix}`;
	}
}

/**
 * Normalizes the path for sorting.
 * If Mirror is disabled, simply returns the original path.
 */
export function normalizeMirrorSortKey(originalPath: string, settings: VaultSummarySettings): string {
	// Check Toggle
	if (!settings.enableMirroring) return originalPath;

	const mirrorDir = settings.mirrorFolderPath.trim();
	if (!mirrorDir) return originalPath;

	const prefix = mirrorDir.replace(/\/+$/, "") + "/";
	return originalPath.startsWith(prefix)
		? originalPath.slice(prefix.length)
		: originalPath;
}

// --- Exclusion Logic ---

export function isUnderDir(filePath: string, dirName: string): boolean {
	const fp = normalizePath(filePath);
	const dn = normalizePath(dirName);
	return fp === dn || fp.startsWith(dn + "/");
}

export function isFolderExcluded(filePath: string, settings: VaultSummarySettings): boolean {
	const normalizedFile = normalizePath(filePath);
	const mirrorDir = settings.mirrorFolderPath.trim();
	const mirrorActive = settings.enableMirroring && mirrorDir.length > 0;

	for (const excludedDir of settings.globalExcludedDirNames) {
		const normalizedExclude = normalizePath(excludedDir);
		if (!normalizedExclude) continue;

		// 1. Direct Match
		if (isUnderDir(normalizedFile, normalizedExclude)) {
			return true;
		}

		// 2. Mirror Relative Match (Only if mirror is active)
		if (mirrorActive && isUnderDir(normalizedFile, mirrorDir)) {
			const mirrorPrefix = mirrorDir.replace(/\/+$/, "") + "/";

			if (normalizedFile.startsWith(mirrorPrefix)) {
				const relativePath = normalizedFile.slice(mirrorPrefix.length);
				if (isUnderDir(relativePath, normalizedExclude)) {
					return true;
				}
			}
		}
	}
	return false;
}

// --- Globs & Patterns ---

function normalizeExcludePath(p: string): string {
	const stripped = p.trim().replace(/^\.\//, "");
	return normalizePath(stripped);
}

function globToRegExp(glob: string): RegExp {
	const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const g = glob.trim();
	let re = "^";
	let i = 0;

	while (i < g.length) {
		const c = g.charAt(i);
		const next = g.charAt(i + 1);

		if (c === "*") {
			if (next === "*") {
				i += 2;
				if (g.charAt(i) === "/") i += 1;
				re += "(?:.*\\/)?";
			} else {
				i += 1;
				re += "[^/]*";
			}
		} else if (c === "?") {
			i += 1;
			re += "[^/]";
		} else {
			re += esc(c);
			i += 1;
		}
	}
	re += "$";
	return new RegExp(re);
}

function matchesAnyGlob(filePath: string, globs: string[]): boolean {
	for (const raw of globs) {
		const g = raw.trim();
		if (!g) continue;
		const rx = globToRegExp(g);
		if (rx.test(filePath)) return true;
	}
	return false;
}

export function isExcludedFilePath(filePath: string, settings: VaultSummarySettings): boolean {
	const norm = normalizeExcludePath(filePath);

	for (const p of settings.excludedFilePaths) {
		if (normalizeExcludePath(p) === norm) return true;
	}

	if (matchesAnyGlob(norm, settings.excludedGlobs)) return true;

	return false;
}
