import { Plugin } from "obsidian";

export interface Candidate {
	sortKeyPath: string;
	originalPath: string;
	sourceLabel: string;
	isRoot?: boolean;
}

export interface RunConfig {
	includeMentions: boolean;
	includeBacklinks: boolean;
	depth: number;
}

export interface VaultSummaryHistory {
	recentFolders: string[];
	recentFiles: string[];
}

export interface VaultSummarySettings {
	outputFilePath: string;

	globalExcludedDirNames: string[];

	enableMirroring: boolean;
	mirrorFolderPath: string;
	primaryLabel: string;
	mirrorLabel: string;

	excludedFilePaths: string[];
	excludedGlobs: string[];

	alwaysIncludePathsAsRoots: string[];
	alwaysIncludePathsAsLinks: string[];

	scanDepth: number;

	backlinksOnRootOnly: boolean;

	lastRunSettings: RunConfig;
}

export interface SummaryPluginInterface extends Plugin {
	settings: VaultSummarySettings;
	history: VaultSummaryHistory;
	saveSettings(): Promise<void>;
	saveHistory(): Promise<void>;
}
