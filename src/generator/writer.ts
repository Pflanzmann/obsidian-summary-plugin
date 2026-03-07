import { App, Notice, TFile, normalizePath } from "obsidian";
import { Candidate, VaultSummarySettings } from "../types";
import {
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

	candidates.sort((a, b) => {
		const aRoot = a.isRoot ? 1 : 0;
		const bRoot = b.isRoot ? 1 : 0;
		if (aRoot !== bRoot) return bRoot - aRoot;

		const cmp = a.sortKeyPath.localeCompare(b.sortKeyPath);
		if (cmp !== 0) return cmp;

		if (settings.enableMirroring) {
			if (a.sourceLabel === settings.primaryLabel && b.sourceLabel === settings.mirrorLabel) return -1;
			if (b.sourceLabel === settings.primaryLabel && a.sourceLabel === settings.mirrorLabel) return 1;
		}

		return a.originalPath.localeCompare(b.originalPath);
	});

	let out = "";
	for (const c of candidates) {
		out += `### FILE: ${c.originalPath}\n`;

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

	const mirrorDir = settings.mirrorFolderPath.trim();
	const mirrorActive = settings.enableMirroring && mirrorDir.length > 0;

	const rootSortKeys = new Set<string>();
	for (const r of rootFiles) {
		rootSortKeys.add(normalizeMirrorSortKey(r.path, settings));
	}

	for (const f of files) {
		const p = normalizePath(f.path);

		const currentSortKey = normalizeMirrorSortKey(p, settings);

		const isRootGroup = rootSortKeys.has(currentSortKey);


		let c: Candidate;

		if (mirrorActive && isUnderDir(p, mirrorDir)) {
			c = {
				sortKeyPath: currentSortKey,
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

		if (isRootGroup) {
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
