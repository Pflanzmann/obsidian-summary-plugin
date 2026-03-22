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
			margin-left: 18px; 
			border-left: 1px solid var(--background-modifier-border);
		}
		.vs-tree-item.vs-tree-item-root {
			margin-left: 0;
			border-left: none;
		}
		.vs-tree-row {
			display: flex;
			align-items: center;
			padding: 2px 0;
			cursor: pointer;
			position: relative; 
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
			flex-grow: 1; 
			margin-right: 10px;
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
		
		.vs-node-action {
			opacity: 0; 
			color: var(--text-muted);
			display: flex;
			align-items: center;
			padding: 2px;
			border-radius: 4px;
			transition: all 0.2s ease;
			margin-right: 5px;
		}
		.vs-node-action:hover {
			color: var(--text-error); 
			background-color: var(--background-modifier-hover);
		}
		.vs-tree-row:hover .vs-node-action {
			opacity: 1; 
		}
		.vs-node-action svg {
			width: 14px;
			height: 14px;
		}
		
		
		.vs-tree-section {
			display: flex;
			flex-direction: column;
		}

		.vs-tree-separator {
			height: 1px;
			background-color: var(--background-modifier-border);
			margin-top: 25px;
			margin-bottom: 15px;
			width: 100%;
			opacity: 0.7;
		}

		.vs-tree-section-header-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-top: 5px;
			margin-bottom: 10px;
			padding-bottom: 4px;
		}

		.vs-tree-section-header {
			font-size: 0.75em;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: var(--text-muted);
			font-weight: 700;
		}
		
		.vs-tree-actions {
			display: flex;
			gap: 4px;
		}

		.vs-icon-btn {
			background: transparent;
			border: none;
			padding: 4px;
			cursor: pointer;
			color: var(--text-muted);
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 4px;
			transition: background-color 0.15s;
		}
		.vs-icon-btn:hover {
			background-color: var(--background-modifier-hover);
			color: var(--text-normal);
		}
		.vs-icon-btn svg {
			width: 16px;
			height: 16px;
		}
		
		.vs-tree-empty-msg {
			font-style: italic;
			color: var(--text-muted);
			font-size: 0.9em;
			padding: 10px 0;
			text-align: center;
		}
		.vs-mirror-settings-container {
			border-left: 2px solid var(--text-muted);
			padding-left: 12px;
			margin-left: 4px;
		}
	`;
	document.head.appendChild(style);
}
