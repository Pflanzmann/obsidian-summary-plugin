export function loadPluginStyles() {
	const styleId = "vault-summary-tree-styles";
	if (document.getElementById(styleId)) return;

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = `
		.vs-tree-container {
			border: 1px solid var(--background-modifier-border);
			background-color: var(--background-primary);
			padding: 10px;
			border-radius: 4px;
			max-height: 400px;
			overflow-y: auto;
			margin-bottom: 20px;
		}
		.vs-tree-item {
			display: flex;
			flex-direction: column;
			margin-left: 18px; /* Indent */
			border-left: 1px solid var(--background-modifier-border);
		}
		.vs-tree-row {
			display: flex;
			align-items: center;
			padding: 2px 0;
			cursor: pointer;
		}
		.vs-tree-row:hover {
			background-color: var(--background-modifier-hover);
		}
		.vs-tree-row input[type="checkbox"] {
			margin-right: 6px;
			cursor: pointer;
		}
		.vs-tree-row .vs-icon {
			margin-right: 4px;
			color: var(--text-muted);
			display: flex;
			align-items: center;
		}
		.vs-tree-label {
			font-size: 0.9em;
			color: var(--text-normal);
		}
		.vs-tree-row.is-folder {
			font-weight: 600;
		}
		.vs-collapse-icon {
			width: 16px;
			height: 16px;
			margin-right: 4px;
			transform: rotate(0deg);
			transition: transform 0.1s ease;
			cursor: pointer;
			opacity: 0.7;
		}
		.vs-collapse-icon.is-collapsed {
			transform: rotate(-90deg);
		}
		.vs-stats-bar {
			display: flex;
			justify-content: space-between;
			font-size: 0.8em;
			color: var(--text-muted);
			margin-bottom: 5px;
			padding: 0 5px;
		}
	`;
	document.head.appendChild(style);
}
