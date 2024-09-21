/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should get CodeLens', () => {
	const docUri = getDocUri('nested/import.preql');

	test('Validate codelens additions', async () => {
		await testCodeLens(docUri, [
			{ command: { title: `Run Query`, command: 'select 1' }, range: toRange(3, 1, 3, 10), isResolved: true },
			{ command: { title: `Render SQL`, command: 'select 1' }, range: toRange(3, 2, 3, 10), isResolved: true },
		]);
	});

});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	const start = new vscode.Position(sLine, sChar);
	const end = new vscode.Position(eLine, eChar);
	return new vscode.Range(start, end);
}

async function testCodeLens(docUri: vscode.Uri, expectedCodeLens: vscode.CodeLens[]) {
	if (!docUri) {
		throw new Error('The test path (docUri) is null or undefined. Please provide a valid document URI.');
	}
	await activate(docUri);

	const actualCodeLens = await vscode.commands.executeCommand<vscode.CodeLens[]>(
		'vscode.executeCodeLensProvider', docUri
	);
	assert.equal(actualCodeLens.length, expectedCodeLens.length);

	expectedCodeLens.forEach((expectedCodeLens, i) => {
		const codeLens = actualCodeLens[i];
		assert.equal(
			codeLens.command!.title, expectedCodeLens.command!.title,
			`Expected codelesnTitle to be "${codeLens.command!.title}", but got "${expectedCodeLens.command!.title}".`
		);
		assert.deepEqual(codeLens.range, expectedCodeLens.range);
	});
}