/// <reference types="vite/client" />

// Allow Shoelace custom elements in TSX
declare namespace JSX {
	interface IntrinsicElements {
		'sl-button': any;
		'sl-button-group': any;
		'sl-input': any;
		'sl-select': any;
		'sl-option': any;
		'sl-dialog': any;
		'sl-color-picker': any;
	}
}
