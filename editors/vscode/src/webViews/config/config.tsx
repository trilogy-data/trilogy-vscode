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

interface CliCommand {
  id: string;
  label: string;
  description: string;
}

const CLI_COMMANDS: CliCommand[] = [
  { id: 'run', label: 'Run', description: 'Execute Trilogy scripts' },
  { id: 'unit', label: 'Unit', description: 'Run unit tests' },
  { id: 'integration', label: 'Integration', description: 'Run integration tests' },
  { id: 'fmt', label: 'Fmt', description: 'Format Trilogy files' },
  { id: 'plan', label: 'Plan', description: 'Show execution plan' },
  { id: 'refresh', label: 'Refresh', description: 'Refresh stale assets' },
  { id: 'ingest', label: 'Ingest', description: 'Bootstrap datasources' },
];

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
  onRunCommand,
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
  onRunCommand: (command: string) => void;
}) {
  return (
    <div className={`config-item ${isActive ? "selected" : ""}`}>
      <div className="config-header" onClick={onSelect}>
        <div className="config-info">
          <span className="config-path" title={config.relativePath}>
            {config.relativePath}
          </span>
          {config.dialect && (
            <span className="config-dialect">{config.dialect}</span>
          )}
          {isActive && <span className="config-active">Active</span>}
        </div>
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
      {serveError && <div className="error">{serveError}</div>}

      {/* Actions row - always visible */}
      <div className="actions-row">
        {CLI_COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            className="action-btn"
            onClick={() => onRunCommand(cmd.id)}
            title={cmd.description}
          >
            {cmd.label}
          </button>
        ))}
        {/* Serve button with special handling */}
        {isServing ? (
          <>
            {serveUrl && (
              <button
                className="action-btn green"
                onClick={onOpenServeUrl}
                title={`Open ${serveUrl}`}
              >
                Open
              </button>
            )}
            <button
              className="action-btn red"
              onClick={onStopServe}
              title="Stop server"
            >
              Stop
            </button>
          </>
        ) : (
          <button
            className="action-btn"
            onClick={onServe}
            title="Start local dev server"
          >
            Serve
          </button>
        )}
      </div>
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

  const handleRunCommand = (configPath: string, command: string) => {
    const parentDir = configPath.replace(/[/\\][^/\\]+$/, '');
    vscode.postMessage({ type: "runCliCommand", command, path: parentDir });
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
                onRunCommand={(command) => handleRunCommand(config.path, command)}
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
