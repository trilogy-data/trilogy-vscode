import * as vscode from 'vscode';

export interface TrilogyConfig {
    path: string;
    relativePath: string;
    dialect?: string;
    parallelism?: number;
    setupFiles?: string[];
}

interface TomlEngineSection {
    dialect?: string;
    parallelism?: number;
}

interface TomlSetupSection {
    sql?: string[];
    trilogy?: string[];
}

interface ParsedToml {
    engine?: TomlEngineSection;
    setup?: TomlSetupSection;
}

/**
 * Service for discovering and managing trilogy.toml configuration files
 */
export class TrilogyConfigService {
    private static instance: TrilogyConfigService;
    private _configs: TrilogyConfig[] = [];
    private _activeConfig: TrilogyConfig | null = null;
    private _context: vscode.ExtensionContext | null = null;

    private readonly _onConfigsChanged = new vscode.EventEmitter<TrilogyConfig[]>();
    public readonly onConfigsChanged = this._onConfigsChanged.event;

    private readonly _onActiveConfigChanged = new vscode.EventEmitter<TrilogyConfig | null>();
    public readonly onActiveConfigChanged = this._onActiveConfigChanged.event;

    private constructor() {}

    public static getInstance(): TrilogyConfigService {
        if (!TrilogyConfigService.instance) {
            TrilogyConfigService.instance = new TrilogyConfigService();
        }
        return TrilogyConfigService.instance;
    }

    public initialize(context: vscode.ExtensionContext): void {
        this._context = context;

        // Restore active config from workspace state
        const savedPath = context.workspaceState.get<string>('trilogy.activeConfigPath');
        if (savedPath) {
            // Will be resolved after discovery
            this._pendingSavedPath = savedPath;
        }

        // Watch for new trilogy.toml files
        const watcher = vscode.workspace.createFileSystemWatcher('**/trilogy.toml');
        watcher.onDidCreate(() => this.discoverConfigs());
        watcher.onDidDelete(() => this.discoverConfigs());
        watcher.onDidChange(() => this.discoverConfigs());
        context.subscriptions.push(watcher);

        // Initial discovery
        this.discoverConfigs();
    }

    private _pendingSavedPath: string | null = null;

    public async discoverConfigs(): Promise<TrilogyConfig[]> {
        const files = await vscode.workspace.findFiles('**/trilogy.toml', '**/node_modules/**');

        const configs: TrilogyConfig[] = [];

        for (const file of files) {
            try {
                const config = await this.parseConfigFile(file);
                configs.push(config);
            } catch (error) {
                console.error(`Failed to parse ${file.fsPath}:`, error);
            }
        }

        this._configs = configs;
        this._onConfigsChanged.fire(configs);

        // Restore saved selection if we have a pending saved path
        if (this._pendingSavedPath) {
            const savedConfig = configs.find(c => c.path === this._pendingSavedPath);
            if (savedConfig) {
                this._activeConfig = savedConfig;
                this._onActiveConfigChanged.fire(savedConfig);
            }
            this._pendingSavedPath = null;
        }

        // If active config was removed, clear it
        if (this._activeConfig && !configs.find(c => c.path === this._activeConfig?.path)) {
            this._activeConfig = null;
            this._onActiveConfigChanged.fire(null);
            this._context?.workspaceState.update('trilogy.activeConfigPath', undefined);
        }

        return configs;
    }

    private async parseConfigFile(uri: vscode.Uri): Promise<TrilogyConfig> {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder('utf-8').decode(content);

        const parsed = this.parseToml(text);

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const relativePath = workspaceFolder
            ? vscode.workspace.asRelativePath(uri, false)
            : uri.fsPath;

        return {
            path: uri.fsPath,
            relativePath: relativePath,
            dialect: parsed.engine?.dialect,
            parallelism: parsed.engine?.parallelism,
            setupFiles: [...(parsed.setup?.sql || []), ...(parsed.setup?.trilogy || [])]
        };
    }

    /**
     * Simple TOML parser for trilogy.toml files
     * Handles basic structure: [section] and key = value pairs
     */
    private parseToml(text: string): ParsedToml {
        const result: ParsedToml = {};
        let currentSection: string | null = null;

        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Section header
            const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                if (currentSection === 'engine') {
                    result.engine = {};
                } else if (currentSection === 'setup') {
                    result.setup = {};
                }
                continue;
            }

            // Key = value pair
            const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
            if (kvMatch && currentSection) {
                const [, key, rawValue] = kvMatch;
                const value = this.parseTomlValue(rawValue);

                if (currentSection === 'engine' && result.engine) {
                    if (key === 'dialect' && typeof value === 'string') {
                        result.engine.dialect = value;
                    } else if (key === 'parallelism' && typeof value === 'number') {
                        result.engine.parallelism = value;
                    }
                } else if (currentSection === 'setup' && result.setup) {
                    if (key === 'sql' && Array.isArray(value)) {
                        result.setup.sql = value as string[];
                    } else if (key === 'trilogy' && Array.isArray(value)) {
                        result.setup.trilogy = value as string[];
                    }
                }
            }
        }

        return result;
    }

    private parseTomlValue(raw: string): string | number | boolean | string[] {
        const trimmed = raw.trim();

        // String (quoted)
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }

        // Array
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            const inner = trimmed.slice(1, -1).trim();
            if (!inner) return [];

            // Split by comma, but be careful with quoted strings
            const items: string[] = [];
            let current = '';
            let inQuote = false;
            let quoteChar = '';

            for (const char of inner) {
                if ((char === '"' || char === "'") && !inQuote) {
                    inQuote = true;
                    quoteChar = char;
                } else if (char === quoteChar && inQuote) {
                    inQuote = false;
                    quoteChar = '';
                } else if (char === ',' && !inQuote) {
                    const item = current.trim();
                    if (item) {
                        // Remove quotes from the item
                        if ((item.startsWith('"') && item.endsWith('"')) ||
                            (item.startsWith("'") && item.endsWith("'"))) {
                            items.push(item.slice(1, -1));
                        } else {
                            items.push(item);
                        }
                    }
                    current = '';
                    continue;
                }
                current += char;
            }

            // Don't forget the last item
            const item = current.trim();
            if (item) {
                if ((item.startsWith('"') && item.endsWith('"')) ||
                    (item.startsWith("'") && item.endsWith("'"))) {
                    items.push(item.slice(1, -1));
                } else {
                    items.push(item);
                }
            }

            return items;
        }

        // Boolean
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;

        // Number
        const num = Number(trimmed);
        if (!isNaN(num)) return num;

        // Default to string
        return trimmed;
    }

    public get configs(): TrilogyConfig[] {
        return this._configs;
    }

    public get activeConfig(): TrilogyConfig | null {
        return this._activeConfig;
    }

    public setActiveConfig(config: TrilogyConfig | null): void {
        this._activeConfig = config;
        this._onActiveConfigChanged.fire(config);

        // Persist to workspace state
        this._context?.workspaceState.update(
            'trilogy.activeConfigPath',
            config?.path
        );
    }

    public getActiveDialect(): string {
        return this._activeConfig?.dialect || 'duck_db';
    }

    public clearActiveConfig(): void {
        this.setActiveConfig(null);
    }
}
