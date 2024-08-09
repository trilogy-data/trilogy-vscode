import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <>
      <header>
        <div>
          <div className="mb-4 border-editor-border border-l-4 border-0 bg-editor rounded-lg  pl-4">
            <h1 className="font-medium mb-1">Current Datasource</h1>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Start using Trilogy by using the default DuckDB connection or
                setting a different connection below.
              </p>
              <a
                className="block text-center bg-button text-button-foreground py-1 px-4 rounded"
                href="command:workbench.view.explorer"
              >
                Add a Connection
              </a>
            </div>
          </div>
          <div className="mb-4 border-editor-border border-l-4 border-0 bg-editor rounded-l pl-4">
            <h1 className="font-medium mb-2">Model Status</h1>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Information on your parsed model will be displayed here.
              </p>
            </div>
          </div>
        </div>
      </header>
      <main>
        <nav className="space-y-8">
          <div>
            <h2 className="mb-2 tracking-widest uppercase text-xs text-muted-foreground">
              Configure GenAI
            </h2>
            <a
              href="command:trilogy.setOpenAIApiKey"
              className="flex gap-2 items-center"
            >
              <i className="pdicon pdicon-openai text-sm inline-flex"></i>
              <div>OpenAI </div>
            </a>
          </div>
          
        </nav>
      </main>
    </>
  );
}

(function () {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  root.render(<App />);

  // Get a reference to the VS Code webview api.
  // We use this API to post messages back to our extension.
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  function initialize() {}

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "initialize":
        initialize();
        return;
    }
  });
})();