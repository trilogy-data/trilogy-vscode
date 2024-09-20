'use strict';


import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	StreamInfo,
} from 'vscode-languageclient';
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
let client: LanguageClient;
function startLangServerDebugging(command: string, args: string[], cwd: string): LanguageClient {
	// const serverOptions: ServerOptions = {
	// 	args,
	// 	command,
	// 	options: { cwd },
	// };
	const serverOptions: ServerOptions = (): Promise<StreamInfo> => {
		return new Promise((resolve, reject) => {
			// Path to the language server executable


			// Spawn the language server process
			const serverProcess: ChildProcess = spawn(command, [], {
				cwd: cwd,  // Set working directory if necessary
			});
			if (!serverProcess.stdout) {
				console.error('Failed to start language server');
				reject(new Error('Failed to start language server'));
			}
			else {
				serverProcess.stdout.on('data', (data) => {
					console.log(`Language Server Output: ${data}`);
				});

			}
			// Listen to stdout and log language server output

			// Listen to stderr and log language server errors
			if (!serverProcess.stderr) {
				console.error('Failed to start language server');
				reject(new Error('Failed to start language server'));
			}
			else {
				serverProcess.stderr.on('data', (data) => {
					console.error(`Language Server Error: ${data}`);
					vscode.window.showErrorMessage(`Language Server Error: ${data}`);
				});
			}
			// Listen for server exit and handle it
			serverProcess.on('exit', (code, signal) => {
				console.log(`Language Server exited with code ${code} and signal ${signal}`);
				if (code !== 0) {
					vscode.window.showErrorMessage(`Language Server exited unexpectedly with code ${code}`);
					reject(new Error(`Language Server exited with code ${code}`));
				}
			});

			// Resolve the StreamInfo (reader and writer)
			resolve({
				reader: serverProcess.stdout!,
				writer: serverProcess.stdin!,
			});
		});
	};
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'trilogy' }],
	};

	// Create and start the LanguageClient
	client = new LanguageClient('exampleLanguageServer', 'Example Language Server', serverOptions, clientOptions);
	// client.start();
	return client;
	// return new LanguageClient(command, serverOptions, getClientOptions());
}