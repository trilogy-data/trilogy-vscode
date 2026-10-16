import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate } from './helper';

suite('Recursive model formatting', () => {
	test('Formats self imports and recurse_edge through the language server', async () => {
		const uri = vscode.Uri.file(path.resolve(
			__dirname, '../../../../trilogy_language_server/tests/fixtures/recurse_edge/process.preql'
		));
		await activate(uri);
		const document = await vscode.workspace.openTextDocument(uri);
		const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
			'vscode.executeFormatDocumentProvider', uri, { tabSize: 4, insertSpaces: true }
		);

		assert.ok(edits, 'The language server should return formatting edits');
		assert.strictEqual(edits.length, 1);
		assert.ok(edits[0].range.isEqual(new vscode.Range(
			document.positionAt(0), document.positionAt(document.getText().length)
		)));
		const formatted = edits[0].newText;
		assert.ok(formatted.includes('self import as parent;'));
		assert.ok(formatted.includes('self import as app;'));
		assert.ok(formatted.includes('recurse_edge(pid, parent.pid)'));
		assert.ok(formatted.includes('merge app_pid into app.pid;'));
		assert.ok(formatted.includes('datasource procs'));
		assert.notStrictEqual(formatted, document.getText());
	});
});
