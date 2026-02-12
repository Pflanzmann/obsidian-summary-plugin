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

/**
 * Normalizes the path for sorting.
 * If a file is in the Mirror folder, strip the mirror prefix so it sorts
 * alongside its original counterpart.
 */
export function normalizeMirrorSortKey(originalPath: string, settings: VaultSummarySettings): string {
	const prefix = settings.mirrorFolderPath.replace(/\/+$/, "") + "/";
	return originalPath.startsWith(prefix)
		? originalPath.slice(prefix.length)
		: originalPath;
}

// --- Exclusion Logic ---

export function isUnderDir(filePath: string, dirName: string): boolean {
	// Normalize both to ensure matching separators
	const fp = normalizePath(filePath);
	const dn = normalizePath(dirName);
	return fp === dn || fp.startsWith(dn + "/");
}

/**
 * Checks if a file should be excluded based on the folder list.
 * Supports:
 * 1. Exact root folders (e.g. "02_Meta")
 * 2. Nested folders (e.g. "DnDWiki/01_Spiele")
 * 3. Mirror-relative exclusions (e.g. "02_Meta" excludes "DnDWiki/02_Meta")
 */
export function isFolderExcluded(filePath: string, settings: VaultSummarySettings): boolean {
	const normalizedFile = normalizePath(filePath);

	for (const excludedDir of settings.globalExcludedDirNames) {
		const normalizedExclude = normalizePath(excludedDir);
		if (!normalizedExclude) continue;

		// 1. Direct Match
		// Handles "02_Meta" -> excluding "02_Meta/file.md"
		// Handles "DnDWiki/01_Spiele" -> excluding "DnDWiki/01_Spiele/file.md"
		if (isUnderDir(normalizedFile, normalizedExclude)) {
			return true;
		}

		// 2. Mirror Relative Match
		// Handles "02_Meta" -> excluding "PublicMirror/02_Meta/file.md"
		// This keeps the behavior that "Global" exclusions apply inside the mirror too.
		if (isUnderDir(normalizedFile, settings.mirrorFolderPath)) {
			const mirrorPrefix = settings.mirrorFolderPath.replace(/\/+$/, "") + "/";

			if (normalizedFile.startsWith(mirrorPrefix)) {
				const relativePath = normalizedFile.slice(mirrorPrefix.length);
				// Check if the file, effectively stripped of its mirror folder, is inside an excluded dir
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
