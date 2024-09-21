import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';
import RenderPanel from '../webViews/render/renderPanel';

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

suite('Webview Tests', () => {

	test('Should open webview successfully', async () => {
		// Trigger the command that opens the webview
		const docUri = getDocUri('nested/import.preql');
		await activate(docUri);
		const webviewPanel: vscode.WebviewPanel = await vscode.commands.executeCommand('trilogy.renderQuery', ['select 1']); // replace with your command ID

		// Get all visible webview panels
		// Retrieve the opened WebviewPanel
		// const webviewPanel = vscode.window.activeTextEditor;
		assert.ok(webviewPanel, 'Webview panel returned undefined');
		// assert webviewPanel.webview.html.includes('select 1');
		const expectedHtml = '<title>Render</title>';
		assert.ok(webviewPanel.webview.html.includes(expectedHtml), `Webview content is incorrect: ${webviewPanel.webview.html}`);
	});


});