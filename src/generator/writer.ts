import { App, Notice, TFile, normalizePath } from "obsidian";
import { Candidate, VaultSummarySettings } from "../types";
import {
	isExcludedFilePath,
	isFolderExcluded,
	isUnderDir,
	normalizeMirrorSortKey
} from "../utils";

export async function processAndWrite(
	app: App,
	candidates: Candidate[],
	settings: VaultSummarySettings,
	destinationPath: string
): Promise<void> {
	if (candidates.length === 0) {
		await writeOutput(app, destinationPath, "(No relevant files found)\n");
		return;
	}

	// --- SORTING LOGIC ---
	candidates.sort((a, b) => {
		// 1. Root files come first
		const aRoot = a.isRoot ? 1 : 0;
		const bRoot = b.isRoot ? 1 : 0;
		if (aRoot !== bRoot) return bRoot - aRoot;

		// 2. Sort by SortKey (Groups Primary and Mirror together if enabled)
		const cmp = a.sortKeyPath.localeCompare(b.sortKeyPath);
		if (cmp !== 0) return cmp;

		// 3. Tie-Breaker: Primary before Mirror
		// Only apply this sort if Mirror Mode is actually enabled.
		if (settings.enableMirroring) {
			if (a.sourceLabel === settings.primaryLabel && b.sourceLabel === settings.mirrorLabel) return -1;
			if (b.sourceLabel === settings.primaryLabel && a.sourceLabel === settings.mirrorLabel) return 1;
		}

		// 4. Fallback: Path sorting
		return a.originalPath.localeCompare(b.originalPath);
	});

	// --- GENERATION LOGIC ---
	let out = "";
	for (const c of candidates) {
		out += `### FILE: ${c.originalPath}\n`;

		// Only add the Source line if a label exists.
		// If Mirror Mode is off, sourceLabel will be empty, and this line is skipped.
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

export function createCandidates(
	files: TFile[],
	settings: VaultSummarySettings,
	rootFiles: TFile[]
): Candidate[] {
	const candidates: Candidate[] = [];

	// Determine if Mirror Mode is "Active".
	// It requires the Toggle to be ON AND a valid Mirror Folder to be defined.
	const mirrorDir = settings.mirrorFolderPath.trim();
	const mirrorActive = settings.enableMirroring && mirrorDir.length > 0;

	// Build a set of "Root Sort Keys" to identify root group members
	const rootSortKeys = new Set<string>();
	for (const r of rootFiles) {
		rootSortKeys.add(normalizeMirrorSortKey(r.path, settings));
	}

	for (const f of files) {
		const p = normalizePath(f.path);

		// Exclusions check
		if (isExcludedFilePath(p, settings)) continue;
		if (isFolderExcluded(p, settings)) continue;

		let c: Candidate;

		if (mirrorActive && isUnderDir(p, mirrorDir)) {
			// It is a Mirror File (AND Mirroring is Enabled)
			c = {
				sortKeyPath: normalizeMirrorSortKey(p, settings),
				originalPath: p,
				sourceLabel: settings.mirrorLabel,
			};
		} else {
			// It is a Standard File
			c = {
				sortKeyPath: p,
				originalPath: p,
				// Only apply the Primary Label if Mirror Mode is active.
				// Otherwise, leave it empty so no label is printed.
				sourceLabel: mirrorActive ? settings.primaryLabel : "",
			};
		}

		if (rootSortKeys.has(c.sortKeyPath)) {
			c.isRoot = true;
		}

		candidates.push(c);
	}
	return candidates;
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
