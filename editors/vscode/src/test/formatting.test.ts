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
		assert.ok(edits.length > 0, 'The model should need formatting');
		// VS Code may split the server's whole-document edit into minimal edits.
		let formatted = document.getText();
		for (const edit of [...edits].sort((a, b) => b.range.start.compareTo(a.range.start))) {
			const start = document.offsetAt(edit.range.start);
			const end = document.offsetAt(edit.range.end);
			formatted = formatted.slice(0, start) + edit.newText + formatted.slice(end);
		}
		assert.ok(formatted.includes('self import as parent;'));
		assert.ok(formatted.includes('self import as app;'));
		assert.ok(formatted.includes('recurse_edge(pid, parent.pid)'));
		assert.ok(formatted.includes('merge app_pid into app.pid;'));
		assert.ok(formatted.includes('datasource procs'));
		assert.notStrictEqual(formatted, document.getText());
	});
});
