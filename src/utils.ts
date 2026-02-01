import { normalizePath } from "obsidian";
import { WikiSummarySettings } from "./types";

// --- Path & Directory Helpers ---

export function posixDirname(p: string): string {
	const s = normalizePath(p);
	const idx = s.lastIndexOf("/");
	if (idx === -1) return ".";
	if (idx === 0) return "/";
	return s.slice(0, idx);
}

export function normalizeWikiSortKey(originalWikiPath: string, settings: WikiSummarySettings): string {
	const prefix = settings.dndwikiDirName.replace(/\/+$/, "") + "/";
	return originalWikiPath.startsWith(prefix)
		? originalWikiPath.slice(prefix.length)
		: originalWikiPath;
}

// --- Exclusion Logic ---

export function isExcludedAtRoot(filePath: string, settings: WikiSummarySettings): boolean {
	const first = filePath.split("/")[0] ?? "";
	return settings.globalExcludedDirNames.includes(first);
}

export function isUnderDir(filePath: string, dirName: string): boolean {
	return filePath === dirName || filePath.startsWith(dirName + "/");
}

export function isExcludedInsideDndWiki(filePath: string, settings: WikiSummarySettings): boolean {
	const prefix = settings.dndwikiDirName.replace(/\/+$/, "") + "/";
	if (!filePath.startsWith(prefix)) return false;

	const rest = filePath.slice(prefix.length);
	const firstInside = rest.split("/")[0] ?? "";
	return settings.globalExcludedDirNames.includes(firstInside);
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

export function isExcludedFilePath(filePath: string, settings: WikiSummarySettings): boolean {
	const norm = normalizeExcludePath(filePath);

	for (const p of settings.excludedFilePaths) {
		if (normalizeExcludePath(p) === norm) return true;
	}

	if (matchesAnyGlob(norm, settings.excludedGlobs)) return true;

	return false;
}
