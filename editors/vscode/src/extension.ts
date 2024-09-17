'use strict';

import * as net from 'net';
import * as path from 'path';
import { ExtensionContext } from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
} from 'vscode-languageclient';
import QueryPanel from './webViews/query/queryPanel';
import RenderPanel from './webViews/render/renderPanel';
import * as vscode from 'vscode';
import { ConfigViewProvider } from "./webViews/config/config-view-provider";
import * as os from 'os';
const isWindows = os.platform() === 'win32';

let client: LanguageClient;

function getClientOptions(): LanguageClientOptions {
	return {
		// Register the server for trilogy documents
		documentSelector: [
			{ scheme: 'file', language: 'trilogy' },
			{ scheme: 'untitled', language: 'trilogy' },
		],
		outputChannelName: 'trilogy',
	};
}

function isStartedInDebugMode(): boolean {
	return false;
	// return process.env.VSCODE_DEBUG_MODE === 'true';
}

function startLangServerTCP(addr: number): LanguageClient {
	const serverOptions: ServerOptions = () => {
		return new Promise((resolve, reject) => {
			const clientSocket = new net.Socket();
			clientSocket.connect(addr, '127.0.0.1', () => {
				resolve({
					reader: clientSocket,
					writer: clientSocket,
				});
			});
		});
	};

	return new LanguageClient(
		`tcp lang server (port ${addr})`,
		serverOptions,
		getClientOptions()
	);
}

function startLangServer(command: string, args: string[], cwd: string): LanguageClient {
	const serverOptions: ServerOptions = {
		args,
		command,
		options: { cwd },
	};

	return new LanguageClient(command, serverOptions, getClientOptions());
}

function registerUI(context: ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('trilogy.runQuery', (command) => {
			QueryPanel.createOrShow(context.extensionUri).then((panel) => {
				panel.runQuery(command);
			});

		}),
		vscode.commands.registerCommand('trilogy.renderQuery', (command, dialect) => {
			RenderPanel.createOrShow(context.extensionUri).then((panel) => {
				panel.queryRender(command, dialect);
			});

		})
	);

	// Keep this for how to interact with webView
	// context.subscriptions.push(
	// 	vscode.commands.registerCommand('trilogy.refresh', () => {
	// 		if (QueryPanel.currentPanel) {
	// 			QueryPanel.currentPanel.doRefactor();
	// 		}
	// 	})
	// );

	// if (vscode.window.registerWebviewPanelSerializer) {
	// 	// Make sure we register a serializer in activation event
	// 	vscode.window.registerWebviewPanelSerializer(QueryPanel.viewType, {
	// 		async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
	// 			// Reset the webview options so we use latest uri for `localResourceRoots`.
	// 			webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
	// 			QueryPanel.revive(webviewPanel, context.extensionUri);
	// 		},
	// 	});
	// }

}

export function activate(context: ExtensionContext) {
	registerUI(context);
	if (isStartedInDebugMode()) {
		// Development - Run the server manually
		client = startLangServerTCP(2087);
	} else {
		// Production - Distribute the LS as a separate package or within the extension?
		const cwd = path.join(__dirname);
		if (isWindows) {
			const serverPath = path.join(__dirname, '..', 'dist', 'trilogy-language-server.exe');
			client = startLangServer(serverPath, [], cwd);
		}
		else {
			const serverPath = path.join(__dirname, '..', 'dist', 'trilogy-language-server');
			client = startLangServer(serverPath, [], cwd);
		}

	}

	const configViewProvider = new ConfigViewProvider(context.extensionUri);
	vscode.window.registerWebviewViewProvider(
		ConfigViewProvider.viewType,
		configViewProvider
	);
	context.subscriptions.push(client.start());
}

export function deactivate(): Thenable<void> {
	return client ? client.stop() : Promise.resolve();
}

