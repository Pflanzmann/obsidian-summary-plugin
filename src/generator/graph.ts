import { App, TFile } from "obsidian";
import { RunConfig, VaultSummarySettings } from "../types";

export interface BFSResult {
	startFiles: TFile[];
	others: TFile[];
}

export function runBFS(
	app: App,
	roots: TFile[],
	config: RunConfig,
	settings: VaultSummarySettings
): BFSResult {
	const { metadataCache, vault } = app;
	const processedPaths = new Set<string>();
	const collectedFilesMap = new Map<string, TFile>();

	// 1. Pre-calculate incoming links if needed
	let globalBacklinkMap: Map<string, Set<string>> | null = null;
	if (config.includeBacklinks) {
		globalBacklinkMap = buildGlobalBacklinkMap(app);
	}

	// 2. Initialize Queue
	let queue: { file: TFile; depth: number }[] = roots.map(f => ({ file: f, depth: 1 }));

	roots.forEach(f => {
		processedPaths.add(f.path);
		collectedFilesMap.set(f.path, f);
	});

	// 3. Process Queue
	while (queue.length > 0) {
		const { file: currentFile, depth } = queue.shift()!;

		if (depth > config.depth) continue;

		// A. Process Outgoing (Mentions)
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

		// B. Process Incoming (Backlinks)
		if (config.includeBacklinks && globalBacklinkMap) {
			// Check Setting: If 'backlinksOnRootOnly' is true, only allow if depth is 1
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

	// 4. Separate Roots from Discovered
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
