import * as vscode from 'vscode';
import {getWebviewOptions} from './utility';
import { QueryDocument, IMessage } from './queryDocument';


const cats = {
	'Coding Cat': 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
	'Compiling Cat': 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
	'Testing Cat': 'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif'
};



class QueryPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: QueryPanel | undefined;

	public static readonly viewType = 'catCoding';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _queryDocument!: QueryDocument;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (QueryPanel.currentPanel) {
			QueryPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			QueryPanel.viewType,
			'Cat Coding',
			column || vscode.ViewColumn.One,
			getWebviewOptions(extensionUri),
		);

		QueryPanel.currentPanel = new QueryPanel(panel, extensionUri);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		QueryPanel.currentPanel = new QueryPanel(panel, extensionUri);
	}

	

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);
		// Handle the asynchronous creation of QueryDocument
		this.initializeQueryDocument(extensionUri);
		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'submit':
						vscode.window.showInformationMessage(`Input received: ${message.text}`);
						this._queryDocument.runQuery(message.text, 100, (msg: IMessage) => this._panel.webview.postMessage(msg));
						return;
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
				}
			},
			null,
			this._disposables
		);
	}
	private async initializeQueryDocument(extensionUri: vscode.Uri) {
		try {
			this._queryDocument = await QueryDocument.create(extensionUri, '');
		} catch (err) {
			console.error(err);
		}
	}
	public doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'refactor' });
	}

	public dispose() {
		QueryPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;

		// Vary the webview's content based on where it is located in the editor.
		switch (this._panel.viewColumn) {
			case vscode.ViewColumn.Two:
				this._updateForCat(webview, 'Compiling Cat');
				return;

			case vscode.ViewColumn.Three:
				this._updateForCat(webview, 'Testing Cat');
				return;

			case vscode.ViewColumn.One:
			default:
				this._updateForCat(webview, 'Coding Cat');
				return;
		}
	}

	private _updateForCat(webview: vscode.Webview, catName: keyof typeof cats) {
		this._panel.title = catName;
		this._panel.webview.html = this._getHtmlForWebview(webview, cats[catName]);
	}

	private _getHtmlForWebview(webview: vscode.Webview, catGifPath: string) {
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

		// And the uri we use to load this script in the webview
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		// Local path to css styles
		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

		// Uri to load styles into webview
		const stylesResetUri = webview.asWebviewUri(styleResetPath);
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();


		return `<!DOCTYPE html>
			<html lang="en">

<head>
	<meta charset="UTF-8">

	<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

	<meta name="viewport" content="width=device-width, initial-scale=1.0">

	<link href="${stylesResetUri}" rel="stylesheet">
	<link href="${stylesMainUri}" rel="stylesheet">

	<title>Cat Coding</title>
</head>


<body>
	<img src="${catGifPath}" width="300" />
	<h1 id="lines-of-code-counter">0</h1>

	<h1>Enter Text</h1>
	<input nonce="${nonce}" type="text" id="inputText" />
	<button id="submitButton">Submit</button>
	<h2>Response</h2>
    <input nonce="${nonce}" type="text" id="responseText" readonly />
	<script nonce="${nonce}">
	// This script will be run inside the webview
	(function () {
		const vscode = acquireVsCodeApi();

		document.getElementById('submitButton').addEventListener('click', () => {
			const input = document.getElementById('inputText').value;
			vscode.postMessage({
				command: 'submit',
				text: input
			});
		});
		window.addEventListener('message', event => {
			const message = event.data;
			console.log('Received', message);
			switch (message.type) {
				case 'query':
					document.getElementById('responseText').value = JSON.stringify(message.results, null, 2);
					break;
			}
		});
	}());
</script>

</body>

</html>`;
	}

	private postMessage(panel: vscode.WebviewPanel, message: IMessage): void {
        panel.webview.postMessage(message);
    }
}


/**
 * Manages cat coding webview panels
 */

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}


export default QueryPanel;