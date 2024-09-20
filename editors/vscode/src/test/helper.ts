/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
} from 'vscode-languageclient';
export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;
/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = await vscode.extensions.getExtension('trilogydata.vscode-trilogy-tools')!;
	const client: LanguageClient = await ext.activate();

	try {
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
		await client.onReady();
		return sleep(2000); // Wait 2 seconds for server activation
	} catch (e) {
		console.error(e);
	}
}


function waitForStateChange(client:LanguageClient): Promise<any> {
    return new Promise((resolve, reject) => {
        client.onDidChangeState((event) => {
            if (event.newState === 2) { // 2 = Running
                vscode.window.showInformationMessage('Language Server is running.');
                resolve(event);  // Resolve the promise when the server is running
            } else if (event.newState === 1) { // 1 = Stopped
                vscode.window.showErrorMessage('Language Server stopped.');
                reject(new Error('Language Server stopped')); // Reject the promise
            } else {
                reject(new Error('Unexpected state change: ' + String(event))); // Reject on unexpected state
            }
        });
    });
}


export async function activateTwo(docUri: vscode.Uri, done: Mocha.Done) {
	try {
		const ext = await vscode.extensions.getExtension('trilogydata.vscode-trilogy-tools')!;
		const client: LanguageClient = await ext.activate();
		return waitForStateChange(client);
	} catch (e) {
		console.error(e);
		throw e;
	}
}



async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}
