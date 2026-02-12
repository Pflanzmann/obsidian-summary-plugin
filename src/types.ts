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

export interface VaultSummarySettings {
	outputFilePath: string;

	// Global / Logic settings
	globalExcludedDirNames: string[];
	mirrorFolderPath: string;

	// Custom Labels
	primaryLabel: string;
	mirrorLabel: string;

	// Exclude specific files:
	excludedFilePaths: string[];
	excludedGlobs: string[];

	// Store history
	recentFolders: string[];
	recentFiles: string[]; // <--- NEW

	// Recursion depth
	scanDepth: number;

	// Persist Mode settings
	lastRunSettings: RunConfig;
}
