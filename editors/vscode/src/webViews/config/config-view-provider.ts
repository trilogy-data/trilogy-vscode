import * as vscode from "vscode";
import { getNonce, replaceWebviewHtmlTokens } from "../utility";
import { TrilogyConfigService, TrilogyConfig } from "../../trilogyConfigService";
import { TrilogyServeService, ServeStatus } from "../../trilogyServeService";

const utf8TextDecoder = new TextDecoder("utf8");

export class ConfigViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "trilogy.configView";

  private _view?: vscode.WebviewView;
  private _configService: TrilogyConfigService;
  private _serveService: TrilogyServeService;

  constructor(private readonly extensionUri: vscode.Uri) {
    this._configService = TrilogyConfigService.getInstance();
    this._serveService = TrilogyServeService.getInstance();

    // Listen for config changes
    this._configService.onConfigsChanged(() => {
      this.updateWebview();
    });

    this._configService.onActiveConfigChanged(() => {
      this.updateWebview();
    });

    // Listen for serve status changes
    this._serveService.onStatusChanged(() => {
      this.updateServeStatus();
    });
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.getRootUri()],
    };

    // Retain webview content when hidden to preserve state
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateWebview();
        this.updateServeStatus();
      }
    });

    webviewView.webview.html = await this.getHtmlForWebview(
      webviewView.webview
    );

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'selectConfig':
          const config = this._configService.configs.find(c => c.path === data.path);
          if (config) {
            this._configService.setActiveConfig(config);
          }
          break;
        case 'clearConfig':
          this._configService.clearActiveConfig();
          break;
        case 'refreshConfigs':
          await this._configService.discoverConfigs();
          break;
        case 'openConfigFile':
          const configPath = data.path;
          if (configPath) {
            const uri = vscode.Uri.file(configPath);
            await vscode.commands.executeCommand('vscode.open', uri);
          }
          break;
        case 'startServe':
          if (data.path) {
            await this._serveService.startServe(data.path);
          } else {
            await this._serveService.selectAndServeFolder();
          }
          break;
        case 'stopServe':
          await this._serveService.stopServe();
          break;
        case 'openServeUrl':
          this._serveService.openUrl();
          break;
      }
    });

    // Send initial state after a short delay to ensure webview is ready
    setTimeout(() => {
      this.updateWebview();
      this.updateServeStatus();
    }, 100);
  }

  private updateWebview() {
    if (!this._view) return;

    const configs = this._configService.configs;
    const activeConfig = this._configService.activeConfig;

    this._view.webview.postMessage({
      type: 'updateConfigs',
      configs: configs.map(c => ({
        path: c.path,
        relativePath: c.relativePath,
        dialect: c.dialect,
        parallelism: c.parallelism,
        setupFiles: c.setupFiles
      })),
      activeConfigPath: activeConfig?.path || null
    });
  }

  private updateServeStatus() {
    if (!this._view) return;

    const status = this._serveService.status;
    this._view.webview.postMessage({
      type: 'updateServeStatus',
      serveStatus: status
    });
  }

  private getRootUri() {
    return this.extensionUri;
  }
  private getWebviewsUri() {
    return vscode.Uri.joinPath(this.getRootUri(), "dist/webViews/config");
  }

  private async getHtmlForWebview(webview: vscode.Webview) {
    const htmlUri = vscode.Uri.joinPath(
      this.getWebviewsUri(),
      "config.html"
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.getWebviewsUri(), "config.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.getRootUri(), "dist/output.css")
    );

    const [bytes] = await Promise.all([vscode.workspace.fs.readFile(htmlUri)]);

    const html = replaceWebviewHtmlTokens(utf8TextDecoder.decode(bytes), {
      cspSource: webview.cspSource,
      cspNonce: getNonce(),
      cssUri: cssUri.toString(),
      jsUri: jsUri.toString(),
    });

    return html;
  }
}
