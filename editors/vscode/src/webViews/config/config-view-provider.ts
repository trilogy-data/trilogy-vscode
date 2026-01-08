import * as vscode from "vscode";
import { getNonce, replaceWebviewHtmlTokens } from "../utility";
import { TrilogyConfigService, TrilogyConfig } from "../../trilogyConfigService";

const utf8TextDecoder = new TextDecoder("utf8");

export class ConfigViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "trilogy.configView";

  private _view?: vscode.WebviewView;
  private _configService: TrilogyConfigService;

  constructor(private readonly extensionUri: vscode.Uri) {
    this._configService = TrilogyConfigService.getInstance();

    // Listen for config changes
    this._configService.onConfigsChanged(() => {
      this.updateWebview();
    });

    this._configService.onActiveConfigChanged(() => {
      this.updateWebview();
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
      }
    });

    // Send initial state after a short delay to ensure webview is ready
    setTimeout(() => {
      this.updateWebview();
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
