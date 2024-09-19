/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import * as assert from 'assert';
export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;
/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('trilogydata.vscode-trilogy-tools')!;
	try {
		assert.ok(ext);
		const client = await ext.activate();
		await client.onReady();
	} catch (e) {
		console.error(e);
		assert.fail(`Test failed with error: ${String(e)}`);
	}
	await sleep(2000); // Wait 2 seconds for server activation
	try {
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
	} catch (e) {
		console.error(e);
		assert.fail(`Test failed with error: ${String(e)}`);
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
