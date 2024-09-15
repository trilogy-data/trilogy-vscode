import * as vscode from 'vscode';
import { Disposable } from '../dispose';
import { IMessage } from './common';



export class RenderDocument extends Disposable implements vscode.CustomDocument {

    static async create(
        uri: vscode.Uri,
        backupId: string | undefined,
    ): Promise<RenderDocument | PromiseLike<RenderDocument>> {
        // If we have a backup, read that. Otherwise read the resource from the workspace
        const trueURI = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
        const instance = new RenderDocument(trueURI);
        await instance.init();
        return instance;
    }

    private readonly _uri: vscode.Uri;
    private async init() {
    }
    private constructor(uri: vscode.Uri) {
        super();
        this._uri = uri;
        const config = vscode.workspace.getConfiguration('trilogy')
    }
    public get uri() { return this._uri; }

    private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
    /**
     * Fired when the document is disposed of.
     */
    public readonly onDidDispose = this._onDidDispose.event;

    /**
     * Called by VS Code when there are no more references to the document.
     *
     * This happens when all editors for it have been closed.
     */
    dispose(): void {
        this._onDidDispose.fire();
        super.dispose();
    }

}
