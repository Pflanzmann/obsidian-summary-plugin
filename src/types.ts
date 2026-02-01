export type SourceLabel = "DM NOTE" | "WIKI ENTRY";

export interface Candidate {
	sortKeyPath: string; // used for sorting + grouping
	originalPath: string; // actual file path to read
	sourceLabel: SourceLabel;
}

export interface WikiSummarySettings {
	outputFilePath: string;

	globalExcludedDirNames: string[];
	dndwikiDirName: string;

	dmNotesLabel: SourceLabel;
	wikiLabel: SourceLabel;

	// Exclude specific files:
	excludedFilePaths: string[]; // exact paths relative to vault root
	excludedGlobs: string[]; // glob patterns (supports **, *, ?)
}
