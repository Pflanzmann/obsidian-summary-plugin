export interface Candidate {
	sortKeyPath: string;
	originalPath: string;
	sourceLabel: string;
	isRoot?: boolean;
}

// Moved here so it can be used in Settings and Generator
export interface SingleFileRunConfig {
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

	// Store history of selected folders
	recentFolders: string[];

	// Recursion depth (Folder mode)
	scanDepth: number;

	// NEW: Persist Single File Mode settings
	singleFileSettings: SingleFileRunConfig;
}
