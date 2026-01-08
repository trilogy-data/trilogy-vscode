import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export interface ServeStatus {
  isRunning: boolean;
  folderPath: string | null;
  url: string | null;
  error: string | null;
}

type ServeStatusListener = (status: ServeStatus) => void;

export class TrilogyServeService {
  private static _instance: TrilogyServeService;
  private _serveProcess: ChildProcess | null = null;
  private _status: ServeStatus = {
    isRunning: false,
    folderPath: null,
    url: null,
    error: null
  };
  private _outputChannel: vscode.OutputChannel;
  private _statusListeners: ServeStatusListener[] = [];

  private constructor() {
    this._outputChannel = vscode.window.createOutputChannel('Trilogy Serve');
  }

  public static getInstance(): TrilogyServeService {
    if (!TrilogyServeService._instance) {
      TrilogyServeService._instance = new TrilogyServeService();
    }
    return TrilogyServeService._instance;
  }

  public onStatusChanged(listener: ServeStatusListener): vscode.Disposable {
    this._statusListeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this._statusListeners.indexOf(listener);
      if (index !== -1) {
        this._statusListeners.splice(index, 1);
      }
    });
  }

  private notifyStatusChanged() {
    for (const listener of this._statusListeners) {
      listener(this._status);
    }
  }

  public get status(): ServeStatus {
    return { ...this._status };
  }

  public async startServe(folderPath: string): Promise<void> {
    if (this._serveProcess) {
      await this.stopServe();
    }

    this._status = {
      isRunning: false,
      folderPath: folderPath,
      url: null,
      error: null
    };
    this.notifyStatusChanged();

    try {
      // Get the trilogy executable path - try 'trilogy' in PATH first
      const trilogyCommand = await this.findTrilogyCommand();

      this._outputChannel.show(true);
      this._outputChannel.appendLine(`Starting Trilogy serve for: ${folderPath}`);
      this._outputChannel.appendLine(`Using command: ${trilogyCommand} serve ${folderPath}`);

      this._serveProcess = spawn(trilogyCommand, ['serve', folderPath], {
        shell: true,
        env: { ...process.env }
      });

      this._serveProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this._outputChannel.appendLine(output);

        // Look for the URL in the output (typically like http://localhost:8000 or similar)
        const urlMatch = output.match(/https?:\/\/[^\s]+/);
        if (urlMatch && !this._status.url) {
          this._status.url = urlMatch[0];
          this._status.isRunning = true;
          this.notifyStatusChanged();
          vscode.window.showInformationMessage(`Trilogy server running at ${this._status.url}`);
        }
      });

      this._serveProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        this._outputChannel.appendLine(`[stderr] ${output}`);

        // Some servers output the URL to stderr
        const urlMatch = output.match(/https?:\/\/[^\s]+/);
        if (urlMatch && !this._status.url) {
          this._status.url = urlMatch[0];
          this._status.isRunning = true;
          this.notifyStatusChanged();
          vscode.window.showInformationMessage(`Trilogy server running at ${this._status.url}`);
        }
      });

      this._serveProcess.on('error', (error: Error) => {
        this._outputChannel.appendLine(`Error: ${error.message}`);
        this._status = {
          isRunning: false,
          folderPath: null,
          url: null,
          error: error.message
        };
        this.notifyStatusChanged();
        vscode.window.showErrorMessage(`Failed to start Trilogy serve: ${error.message}`);
      });

      this._serveProcess.on('close', (code: number | null) => {
        this._outputChannel.appendLine(`Trilogy serve process exited with code ${code}`);
        this._serveProcess = null;
        this._status = {
          isRunning: false,
          folderPath: null,
          url: null,
          error: code !== 0 ? `Process exited with code ${code}` : null
        };
        this.notifyStatusChanged();
      });

      // Mark as running after a short delay if no error occurs
      setTimeout(() => {
        if (this._serveProcess && !this._status.isRunning && !this._status.error) {
          this._status.isRunning = true;
          this.notifyStatusChanged();
        }
      }, 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._status.error = errorMessage;
      this.notifyStatusChanged();
      vscode.window.showErrorMessage(`Failed to start Trilogy serve: ${errorMessage}`);
    }
  }

  public async stopServe(): Promise<void> {
    if (this._serveProcess) {
      this._outputChannel.appendLine('Stopping Trilogy serve...');

      // Kill the process tree
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this._serveProcess.pid), '/f', '/t']);
      } else {
        this._serveProcess.kill('SIGTERM');
        // Force kill after 2 seconds if not terminated
        setTimeout(() => {
          if (this._serveProcess) {
            this._serveProcess.kill('SIGKILL');
          }
        }, 2000);
      }

      this._serveProcess = null;
      this._status = {
        isRunning: false,
        folderPath: null,
        url: null,
        error: null
      };
      this.notifyStatusChanged();
      this._outputChannel.appendLine('Trilogy serve stopped.');
    }
  }

  public async selectAndServeFolder(): Promise<void> {
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select folder to serve with Trilogy',
      openLabel: 'Select Folder'
    });

    if (folders && folders.length > 0) {
      await this.startServe(folders[0].fsPath);
    }
  }

  public openUrl(): void {
    if (this._status.url) {
      vscode.env.openExternal(vscode.Uri.parse(this._status.url));
    }
  }

  private async findTrilogyCommand(): Promise<string> {
    // Check if trilogy is available in PATH
    const isAvailable = await this.checkTrilogyAvailable();
    if (!isAvailable) {
      const action = await vscode.window.showErrorMessage(
        'Trilogy CLI not found. Please install it to use the serve feature.',
        'Show Installation Instructions',
        'Cancel'
      );
      if (action === 'Show Installation Instructions') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/trilogy-data/pytrilogy#installation'));
      }
      throw new Error('Trilogy CLI not found. Install with: pip/uv install pytrilogy');
    }
    return 'trilogy';
  }

  private async checkTrilogyAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('trilogy', ['--version'], { shell: true });
      checkProcess.on('error', () => resolve(false));
      checkProcess.on('close', (code) => resolve(code === 0));
    });
  }

  public dispose(): void {
    this.stopServe();
    this._outputChannel.dispose();
  }
}
