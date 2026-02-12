export interface Candidate {
	sortKeyPath: string;
	originalPath: string;
	sourceLabel: string;
	isRoot?: boolean;
}

// Renamed from SingleFileRunConfig to RunConfig
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

	// Store history of selected folders
	recentFolders: string[];

	// Recursion depth (Default for Folder mode if not overridden, though we now override it)
	scanDepth: number;

	// Persist Mode settings (shared between Single File and Folder for now)
	lastRunSettings: RunConfig;
}
