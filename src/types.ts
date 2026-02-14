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

	// Global / Logic settings
	globalExcludedDirNames: string[];

	// --- Mirroring Settings ---
	enableMirroring: boolean;
	mirrorFolderPath: string;
	primaryLabel: string;
	mirrorLabel: string;

	// Exclude specific files:
	excludedFilePaths: string[];
	excludedGlobs: string[];

	// Recursion depth
	scanDepth: number;

	// NEW: Limit backlinks traversal
	backlinksOnRootOnly: boolean;

	// Persist Mode settings
	lastRunSettings: RunConfig;
}

export interface SummaryPluginInterface extends Plugin {
	settings: VaultSummarySettings;
	history: VaultSummaryHistory;
	saveSettings(): Promise<void>;
	saveHistory(): Promise<void>;
}
