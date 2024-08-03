import * as vscode from 'vscode';
import { getWebviewOptions, replaceWebviewHtmlTokens, getNonce } from '../utility';
import { QueryDocument, IMessage } from './queryDocument';

const utf8TextDecoder = new TextDecoder("utf8");

class QueryPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: QueryPanel | undefined;

    public static readonly viewType = 'queryPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _queryDocument!: QueryDocument;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

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

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'submit':
                        vscode.window.showInformationMessage(`Input received: ${message.text}`);
                        this.runQuery(message.text);
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

    public async runQuery(query: string) {
        this._queryDocument.runQuery(query, 100, (msg: IMessage) => this._panel.webview.postMessage(msg));
    }

    public static async createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (QueryPanel.currentPanel) {
            QueryPanel.currentPanel._panel.reveal(column);
            return QueryPanel.currentPanel;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            QueryPanel.viewType,
            'Trilogy Query',
            column || vscode.ViewColumn.One,
            getWebviewOptions(extensionUri),
        );

        QueryPanel.currentPanel = await QueryPanel.create(panel, extensionUri);
        return QueryPanel.currentPanel
    }

    public static async revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        QueryPanel.currentPanel = await QueryPanel.create(panel, extensionUri);
    }

    private static async create(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): Promise<QueryPanel> {
        const queryPanel = new QueryPanel(panel, extensionUri);
        await queryPanel.initializeQueryDocument(extensionUri);
        queryPanel._update();
        return queryPanel;
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

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private getRootUri() {
        return this._extensionUri;
    }

    private getWebviewsUri() {
        return vscode.Uri.joinPath(this.getRootUri(), "dist/webviews");
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {

        const htmlUri = vscode.Uri.joinPath(
            this.getRootUri(),
            "dist/webviews/query.html"
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.getWebviewsUri(), "query.js")
        );
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.getRootUri(), "dist/output.css")
        );

        const [bytes] = await Promise.all([vscode.workspace.fs.readFile(htmlUri)]);

        const html = replaceWebviewHtmlTokens(utf8TextDecoder.decode(bytes), {
            cspSource: webview.cspSource,
            cspNonce: getNonce(),
            cssUri: cssUri.toString(),
            jsUri: jsUri.toString(),
        });

        return html;
    }

    private postMessage(panel: vscode.WebviewPanel, message: IMessage): void {
        panel.webview.postMessage(message);
    }
}


export default QueryPanel;
