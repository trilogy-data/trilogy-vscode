import * as vscode from "vscode";
import { getNonce, replaceWebviewHtmlTokens } from "../utility";

const utf8TextDecoder = new TextDecoder("utf8");

export class ConfigViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "trilogy.configView";

  private _view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this.getRootUri()],
    };

    webviewView.webview.html = await this.getHtmlForWebview(
      webviewView.webview
    );

    webviewView.webview.onDidReceiveMessage((data) => {
    });
  }

  private getRootUri() {
    return this.extensionUri;
  }
  private getWebviewsUri() {
    return vscode.Uri.joinPath(this.getRootUri(), "dist/webviews");
  }

  
  
  private async getHtmlForWebview(webview: vscode.Webview) {
    const htmlUri = vscode.Uri.joinPath(
      this.getRootUri(),
      "dist/webviews/config.html"
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