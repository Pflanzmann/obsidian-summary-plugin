export type SourceLabel = "DM NOTE" | "WIKI ENTRY";

export interface Candidate {
	sortKeyPath: string;
	originalPath: string;
	sourceLabel: SourceLabel;
	isRoot?: boolean;
}

export interface WikiSummarySettings {
	outputFilePath: string;

	// Global / Logic settings
	globalExcludedDirNames: string[];
	dndwikiDirName: string;

	// Labels
	dmNotesLabel: SourceLabel;
	wikiLabel: SourceLabel;

	// Exclude specific files:
	excludedFilePaths: string[];
	excludedGlobs: string[];

	// NEW: Store history of selected folders
	recentFolders: string[];

	// NEW: Recursion depth
	scanDepth: number;
}
