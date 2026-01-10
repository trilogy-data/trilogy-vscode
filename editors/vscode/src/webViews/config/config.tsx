import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

interface TrilogyConfig {
  path: string;
  relativePath: string;
  dialect?: string;
  parallelism?: number;
  setupFiles?: string[];
}

interface ServeStatus {
  isRunning: boolean;
  folderPath: string | null;
  url: string | null;
  error: string | null;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

function ConfigItem({
  config,
  isActive,
  isServing,
  serveUrl,
  serveError,
  onSelect,
  onOpen,
  onServe,
  onStopServe,
  onOpenServeUrl,
}: {
  config: TrilogyConfig;
  isActive: boolean;
  isServing: boolean;
  serveUrl: string | null;
  serveError: string | null;
  onSelect: () => void;
  onOpen: () => void;
  onServe: () => void;
  onStopServe: () => void;
  onOpenServeUrl: () => void;
}) {
  return (
    <div
      className={`list-item ${isActive ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="list-item-row">
        <div className="list-item-content" title={config.relativePath}>
          {config.relativePath}
          {config.dialect && (
            <div className="description">{config.dialect}</div>
          )}
        </div>
        <div className="list-item-actions">
          {isServing ? (
            <>
              {serveUrl && (
                <button
                  className="icon-btn green"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenServeUrl();
                  }}
                  title={`Open ${serveUrl}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                    <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
                  </svg>
                </button>
              )}
              <button
                className="icon-btn red"
                onClick={(e) => {
                  e.stopPropagation();
                  onStopServe();
                }}
                title="Stop server"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/>
                </svg>
              </button>
            </>
          ) : (
            <button
              className="inline-btn"
              onClick={(e) => {
                e.stopPropagation();
                onServe();
              }}
              title="Start local dev server"
            >
              Serve
            </button>
          )}
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="Open file"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z" />
            </svg>
          </button>
        </div>
      </div>
      {isActive && <div className="badge">Active</div>}
      {serveError && <div className="error">{serveError}</div>}
    </div>
  );
}

function App() {
  const [configs, setConfigs] = useState<TrilogyConfig[]>([]);
  const [activeConfigPath, setActiveConfigPath] = useState<string | null>(null);
  const [serveStatus, setServeStatus] = useState<ServeStatus>({
    isRunning: false,
    folderPath: null,
    url: null,
    error: null
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case "updateConfigs":
          setConfigs(message.configs || []);
          setActiveConfigPath(message.activeConfigPath);
          break;
        case "updateServeStatus":
          setServeStatus(message.serveStatus);
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

  const handleStartServe = (configPath: string) => {
    const parentDir = configPath.replace(/[/\\][^/\\]+$/, '');
    vscode.postMessage({ type: "startServe", path: parentDir });
  };

  const handleStopServe = () => {
    vscode.postMessage({ type: "stopServe" });
  };

  const handleOpenServeUrl = () => {
    vscode.postMessage({ type: "openServeUrl" });
  };

  const activeConfig = configs.find((c) => c.path === activeConfigPath);

  const isConfigServing = (configPath: string) => {
    if (!serveStatus.isRunning || !serveStatus.folderPath) return false;
    const parentDir = configPath.replace(/[/\\][^/\\]+$/, '');
    return serveStatus.folderPath === parentDir;
  };

  return (
    <div className="sidebar">
      {/* Active Configuration Section */}
      <div className="section">
        <div className="section-header">
          <span>Active Configuration</span>
          <button className="icon-btn" onClick={handleRefresh} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
            </svg>
          </button>
        </div>
        <div className="section-content">
          {activeConfig ? (
            <>
              <div className="item-row">
                <span className="mono">{activeConfig.relativePath}</span>
              </div>
              {activeConfig.dialect && (
                <div className="item-row muted">
                  Dialect: <span className="mono">{activeConfig.dialect}</span>
                </div>
              )}
              {activeConfig.setupFiles && activeConfig.setupFiles.length > 0 && (
                <div className="item-row muted">
                  Setup: {activeConfig.setupFiles.length} file(s)
                </div>
              )}
              <button className="btn" onClick={handleClearConfig}>
                Use Default (DuckDB)
              </button>
            </>
          ) : (
            <div className="item-row muted">Using default DuckDB connection.</div>
          )}
        </div>
      </div>

      {/* Configurations Section */}
      <div className="section">
        <div className="section-header">
          <span>Configurations</span>
        </div>
        <div className="section-content">
          {configs.length === 0 ? (
            <div className="item-row muted">No trilogy.toml files found.</div>
          ) : (
            configs.map((config) => (
              <ConfigItem
                key={config.path}
                config={config}
                isActive={config.path === activeConfigPath}
                isServing={isConfigServing(config.path)}
                serveUrl={isConfigServing(config.path) ? serveStatus.url : null}
                serveError={isConfigServing(config.path) ? serveStatus.error : null}
                onSelect={() => handleSelectConfig(config)}
                onOpen={() => handleOpenConfig(config)}
                onServe={() => handleStartServe(config.path)}
                onStopServe={handleStopServe}
                onOpenServeUrl={handleOpenServeUrl}
              />
            ))
          )}
        </div>
      </div>

      {/* GenAI Section */}
      <div className="section">
        <div className="section-header">
          <span>GenAI</span>
        </div>
        <div className="section-content">
          <a href="command:trilogy.setOpenAIApiKey" className="link">
            <i className="pdicon pdicon-openai"></i>
            <span>OpenAI</span>
          </a>
        </div>
      </div>
    </div>
  );
}

(function () {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  root.render(<App />);
})();
