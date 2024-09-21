import * as vscode from 'vscode';
import { getWebviewOptions, replaceWebviewHtmlTokens, getNonce } from '../utility';
import { RenderDocument, } from './renderDocument';
import { IMessage } from './common';

const utf8TextDecoder = new TextDecoder("utf8");

class RenderPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: RenderPanel | undefined;

    public static readonly viewType = 'renderPanel';

    public readonly panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _last_msg: IMessage | null;
    private _renderDocument!: RenderDocument;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this._extensionUri = extensionUri;
        this._last_msg = null;

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this.panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this.panel.onDidChangeViewState(
            e => {
                if (this.panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

    }

    public async queryRender(sqlQueries: Array<string>, dialect:string):Promise<vscode.WebviewPanel> {
                // this._queryDocument.runQuery(query, 100, (msg: IMessage) => { this._last_msg = msg; this._panel.webview.postMessage(msg) });
        const msg: IMessage = { type: 'render-queries', renderQueries:sqlQueries, dialect:dialect };
        this._last_msg = msg;
        this.panel.webview.postMessage(msg);
        return this.panel;
        

    }

    public static async createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (RenderPanel.currentPanel) {
            RenderPanel.currentPanel.panel.reveal(column);
            return RenderPanel.currentPanel;
        }

        // Otherwise, Qcreate a new panel.
        const panel = vscode.window.createWebviewPanel(
            RenderPanel.viewType,
            'Render (Trilogy)',
            column || vscode.ViewColumn.One,
            getWebviewOptions(extensionUri),
        );

        RenderPanel.currentPanel = await RenderPanel.create(panel, extensionUri);
        return RenderPanel.currentPanel;
    }

    public static async revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        RenderPanel.currentPanel = await RenderPanel.create(panel, extensionUri);
    }

    private static async create(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): Promise<RenderPanel> {
        const renderPanel = new RenderPanel(panel, extensionUri);
        await renderPanel.initializeRenderDocument(extensionUri);
        await renderPanel._update();
        return renderPanel;
    }

    private async initializeRenderDocument(extensionUri: vscode.Uri) {
        try {
            this._renderDocument = await RenderDocument.create(extensionUri, '');
        } catch (err) {
            console.error(err);
        }
    }


    public dispose() {
        RenderPanel.currentPanel = undefined;

        // Clean up our resources
        this.panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this.panel.webview;
        if (!this.panel.webview.html) {
            this.panel.webview.html = await this._getHtmlForWebview(webview);
        }
        if (this._last_msg) {
            await this.panel.webview.postMessage(this._last_msg);
        }
    }

    private getRootUri() {
        return this._extensionUri;
    }

    private getWebviewsUri() {
        return vscode.Uri.joinPath(this.getRootUri(), "dist/webViews/render");
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {

        const htmlUri = vscode.Uri.joinPath(
            this.getWebviewsUri(),
            "render.html"
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.getWebviewsUri(), "render.js")
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

}


export default RenderPanel;
