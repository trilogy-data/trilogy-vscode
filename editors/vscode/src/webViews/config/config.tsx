import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

interface TrilogyConfig {
  path: string;
  relativePath: string;
  dialect?: string;
  parallelism?: number;
  setupFiles?: string[];
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

function ConfigItem({
  config,
  isActive,
  onSelect,
  onOpen,
}: {
  config: TrilogyConfig;
  isActive: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`p-2 rounded cursor-pointer border transition-colors ${
        isActive
          ? "bg-button text-button-foreground border-button"
          : "bg-editor border-editor-border hover:border-button"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={config.relativePath}>
            {config.relativePath}
          </div>
          {config.dialect && (
            <div className="text-xs text-muted-foreground mt-1">
              Dialect: <span className="font-mono">{config.dialect}</span>
            </div>
          )}
        </div>
        <button
          className="p-1 hover:bg-editor-border rounded text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          title="Open file"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z" />
          </svg>
        </button>
      </div>
      {isActive && (
        <div className="text-xs mt-1 opacity-80">Active</div>
      )}
    </div>
  );
}

function App() {
  const [configs, setConfigs] = useState<TrilogyConfig[]>([]);
  const [activeConfigPath, setActiveConfigPath] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case "updateConfigs":
          setConfigs(message.configs || []);
          setActiveConfigPath(message.activeConfigPath);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSelectConfig = (config: TrilogyConfig) => {
    vscode.postMessage({ type: "selectConfig", path: config.path });
  };

  const handleClearConfig = () => {
    vscode.postMessage({ type: "clearConfig" });
  };

  const handleRefresh = () => {
    vscode.postMessage({ type: "refreshConfigs" });
  };

  const handleOpenConfig = (config: TrilogyConfig) => {
    vscode.postMessage({ type: "openConfigFile", path: config.path });
  };

  const activeConfig = configs.find((c) => c.path === activeConfigPath);

  return (
    <>
      <header>
        <div>
          <div className="mb-4 border-editor-border border-l-4 border-0 bg-editor rounded-lg pl-4">
            <div className="flex items-center justify-between mb-1">
              <h1 className="font-medium">Active Configuration</h1>
              <button
                className="p-1 hover:bg-editor-border rounded text-muted-foreground hover:text-foreground"
                onClick={handleRefresh}
                title="Refresh configurations"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"
                  />
                  <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {activeConfig ? (
                <>
                  <div className="text-sm">
                    <div className="font-mono text-xs bg-editor-border rounded px-2 py-1">
                      {activeConfig.relativePath}
                    </div>
                    {activeConfig.dialect && (
                      <div className="mt-2 text-muted-foreground">
                        Dialect: <span className="font-mono">{activeConfig.dialect}</span>
                      </div>
                    )}
                    {activeConfig.setupFiles && activeConfig.setupFiles.length > 0 && (
                      <div className="mt-1 text-muted-foreground text-xs">
                        Setup: {activeConfig.setupFiles.length} file(s)
                      </div>
                    )}
                  </div>
                  <button
                    className="text-center bg-editor-border text-foreground py-1 px-4 rounded text-sm hover:opacity-80"
                    onClick={handleClearConfig}
                  >
                    Use Default (DuckDB)
                  </button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Using default DuckDB connection. Select a trilogy.toml below to use a
                  different configuration.
                </p>
              )}
            </div>
          </div>

          <div className="mb-4 border-editor-border border-l-4 border-0 bg-editor rounded-lg pl-4">
            <h1 className="font-medium mb-2">Available Configurations</h1>
            <div className="flex flex-col gap-2">
              {configs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No trilogy.toml files found in workspace. Create one to configure
                  your dialect and setup scripts.
                </p>
              ) : (
                configs.map((config) => (
                  <ConfigItem
                    key={config.path}
                    config={config}
                    isActive={config.path === activeConfigPath}
                    onSelect={() => handleSelectConfig(config)}
                    onOpen={() => handleOpenConfig(config)}
                  />
                ))
              )}
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
})();
