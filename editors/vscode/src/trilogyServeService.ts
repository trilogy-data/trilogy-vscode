import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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
      // Get the trilogy executable path - check venv first, then PATH
      const trilogyCommand = await this.findTrilogyCommand(folderPath);

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

        // Capture error messages for display
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('traceback')) {
          this._status.error = output.trim().split('\n').slice(-3).join(' ').substring(0, 200);
          this.notifyStatusChanged();
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

  private async findTrilogyCommand(folderPath: string): Promise<string> {
    this._outputChannel.appendLine('Looking for trilogy CLI...');

    // First, check for virtual environment in the workspace
    const venvPaths = await this.findVenvTrilogyPath(folderPath);
    if (venvPaths) {
      this._outputChannel.appendLine(`Found trilogy in venv: ${venvPaths}`);
      return venvPaths;
    }

    // Then check if trilogy is available in PATH
    const isAvailable = await this.checkTrilogyAvailable('trilogy');
    if (isAvailable) {
      this._outputChannel.appendLine('Found trilogy in PATH');
      return 'trilogy';
    }

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

  private async findVenvTrilogyPath(folderPath: string): Promise<string | null> {
    const isWindows = process.platform === 'win32';
    const trilogyBinary = isWindows ? 'trilogy.exe' : 'trilogy';
    const binDir = isWindows ? 'Scripts' : 'bin';

    // First, try to get the Python interpreter from VSCode's Python extension
    const pythonPath = await this.getVSCodePythonPath();
    if (pythonPath) {
      this._outputChannel.appendLine(`VSCode Python interpreter: ${pythonPath}`);
      // Extract the venv bin/Scripts directory from the python path
      const pythonDir = path.dirname(pythonPath);
      const trilogyPath = path.join(pythonDir, trilogyBinary);
      this._outputChannel.appendLine(`Checking: ${trilogyPath}`);

      if (fs.existsSync(trilogyPath)) {
        const works = await this.checkTrilogyAvailable(trilogyPath);
        if (works) {
          return trilogyPath;
        }
      }
    }

    // Fall back to looking for common virtual environment locations
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const searchPaths: string[] = [folderPath];

    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        searchPaths.push(folder.uri.fsPath);
      }
    }

    const venvNames = ['.venv', 'venv', '.env', 'env', '.venv-1', 'venv-1'];

    for (const searchPath of searchPaths) {
      for (const venvName of venvNames) {
        const trilogyPath = path.join(searchPath, venvName, binDir, trilogyBinary);
        this._outputChannel.appendLine(`Checking: ${trilogyPath}`);

        if (fs.existsSync(trilogyPath)) {
          // Verify it actually works
          const works = await this.checkTrilogyAvailable(trilogyPath);
          if (works) {
            return trilogyPath;
          }
        }
      }
    }

    return null;
  }

  private async getVSCodePythonPath(): Promise<string | null> {
    try {
      // Try to get the Python path from VSCode's Python extension
      const pythonExtension = vscode.extensions.getExtension('ms-python.python');
      if (pythonExtension) {
        if (!pythonExtension.isActive) {
          await pythonExtension.activate();
        }
        const pythonApi = pythonExtension.exports;

        // Try the newer API first
        if (pythonApi?.environments?.getActiveEnvironmentPath) {
          const envPath = await pythonApi.environments.getActiveEnvironmentPath();
          if (envPath?.path) {
            return envPath.path;
          }
        }
      }

      // Fall back to checking the python.defaultInterpreterPath setting
      const config = vscode.workspace.getConfiguration('python');
      const defaultPath = config.get<string>('defaultInterpreterPath');
      if (defaultPath && defaultPath !== 'python') {
        return defaultPath;
      }

      // Also check pythonPath (older setting)
      const pythonPath = config.get<string>('pythonPath');
      if (pythonPath && pythonPath !== 'python') {
        return pythonPath;
      }
    } catch (err) {
      this._outputChannel.appendLine(`Error getting Python path: ${err}`);
    }

    return null;
  }

  private async checkTrilogyAvailable(trilogyCmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      this._outputChannel.appendLine(`Checking: ${trilogyCmd} --version`);

      const checkProcess = spawn(trilogyCmd, ['--version'], { shell: true });

      let stdout = '';
      let stderr = '';

      checkProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      checkProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      checkProcess.on('error', (err) => {
        this._outputChannel.appendLine(`  error: ${err.message}`);
        resolve(false);
      });

      checkProcess.on('close', (code) => {
        this._outputChannel.appendLine(`  exit code: ${code}`);
        if (stdout) this._outputChannel.appendLine(`  stdout: ${stdout.trim()}`);
        if (stderr) this._outputChannel.appendLine(`  stderr: ${stderr.trim()}`);
        resolve(code === 0);
      });
    });
  }

  public dispose(): void {
    this.stopServe();
    this._outputChannel.dispose();
  }
}
