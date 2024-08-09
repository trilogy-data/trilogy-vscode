import * as vscode from 'vscode';


export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')]
	};
}

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}


interface ReplaceWebviewHtmlTokensOptions {
	cspSource: string;
	cspNonce: string;
	cssUri: string;
	jsUri: string;
  }
  
  export function replaceWebviewHtmlTokens(
	html: string,
	options: ReplaceWebviewHtmlTokensOptions
  ) {
	const {
	  cspNonce,
	  cspSource,
	  cssUri,
	  jsUri
	} = options;
  
	return html.replace(
	  /#{(jsUri|cssUri|cspSource|cspNonce|codiconsUri|iconsUri|rootUri)}/g,
	  (_substring: string, token: string) => {
		switch (token) {
		  case "cspSource":
			return cspSource;
		  case "cspNonce":
			return cspNonce;
		  case "cssUri":
			return cssUri;
		  case "jsUri":
			return jsUri;
		//   case "codiconsUri":
		// 	return codiconsUri;
		//   case "iconsUri":
		// 	return iconsUri;
		//   case "rootUri":
		// 	return rootUri;
		  default:
			return "";
		}
	  }
	);
  }