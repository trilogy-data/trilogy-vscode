import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable } from '../dispose';
import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { ColumnDescription, IMessage, RowData } from './common';
import { TrilogyConfigService } from '../../trilogyConfigService';

export class QueryDocument extends Disposable implements vscode.CustomDocument {

    static async create(
        uri: vscode.Uri,
        backupId: string | undefined,
    ): Promise<QueryDocument | PromiseLike<QueryDocument>> {
        // If we have a backup, read that. Otherwise read the resource from the workspace
        const trueURI = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
        const instance = new QueryDocument(trueURI);
        await instance.init();
        return instance;
    }

    private readonly _uri: vscode.Uri;
    private _instance: DuckDBInstance | null = null;
    private _connection: DuckDBConnection | null = null;
    private _configService: TrilogyConfigService;
    private _setupCompleted: boolean = false;

    private constructor(uri: vscode.Uri) {
        super();
        this._uri = uri;
        this._configService = TrilogyConfigService.getInstance();
    }

    private async init() {
        // Create an in-memory DuckDB instance
        this._instance = await DuckDBInstance.create(':memory:');
        this._connection = await this._instance.connect();
        await this.runSetupScripts();
    }

    private async runSetupScripts(): Promise<void> {
        const activeConfig = this._configService.activeConfig;
        if (!activeConfig || !activeConfig.setupFiles || activeConfig.setupFiles.length === 0) {
            this._setupCompleted = true;
            return;
        }

        // Get the directory of the trilogy.toml file
        const configDir = path.dirname(activeConfig.path);

        for (const setupFile of activeConfig.setupFiles) {
            try {
                const setupPath = path.isAbsolute(setupFile)
                    ? setupFile
                    : path.join(configDir, setupFile);

                const fileUri = vscode.Uri.file(setupPath);
                const content = await vscode.workspace.fs.readFile(fileUri);
                const sql = new TextDecoder('utf-8').decode(content);

                // Execute the setup SQL
                try {
                    await this.connection.run(sql);
                    console.log(`Successfully ran setup script: ${setupFile}`);
                } catch (err) {
                    console.error(`Error running setup script ${setupFile}:`, err);
                    // Continue with other scripts even if one fails
                }
            } catch (error) {
                console.error(`Failed to read setup script ${setupFile}:`, error);
            }
        }

        this._setupCompleted = true;
    }

    public get uri() { return this._uri; }
    public get connection() { return this._connection!; }
    public get dialect(): string {
        return this._configService.getActiveDialect();
    }

    private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
    /**
     * Fired when the document is disposed of.
     */
    public readonly onDidDispose = this._onDidDispose.event;

    /**
     * Called by VS Code when there are no more references to the document.
     *
     * This happens when all editors for it have been closed.
     */
    dispose(): void {
        this._onDidDispose.fire();
        // Close connection and instance
        if (this._connection) {
            this._connection.closeSync();
        }
        if (this._instance) {
            this._instance.closeSync();
        }
        super.dispose();
    }

    private formatSql(sql: string, limit: number, offset: number): string {
        return `SELECT * FROM (\n${sql.replace(';', '')}\n) LIMIT ${limit} OFFSET ${offset}`;
    }

    private cleanResults(results: RowData[]): RowData[] {
        // DuckDB can sometimes give us BigInt values, which won't JSON.stringify
        // https://github.com/duckdb/duckdb-node/blob/f9a910d544835f55dac36485d767b1c2f6aafb87/src/statement.cpp#L122
        for (const row of results) {
            for (const [key, value] of Object.entries(row)) {
                if (typeof value === "bigint") {
                    row[key] = Number(value);
                }
            }
        }
        return results;
    }

    /**
     * Execute SQL and return results as row objects
     */
    private async executeAndGetRows(sql: string): Promise<RowData[]> {
        const reader = await this.connection.runAndReadAll(sql);
        return reader.getRowObjects() as RowData[];
    }

    async runQuery(sql: string, limit: number, callback: (msg: IMessage) => void): Promise<void> {
        // check if it is a CALL statement
        const checkSQL = sql.toLowerCase().trim();
        if (checkSQL.startsWith('call') || checkSQL.startsWith('install') || checkSQL.startsWith('load')) {
            callback({ type: 'query-parse', success: true, message: 'finished-parse' });
            try {
                const rows = await this.executeAndGetRows(sql);
                callback({ type: 'query', headers: [], sql: sql, success: true, results: this.cleanResults(rows), exception: null });
            } catch (err: any) {
                callback({ type: 'query', sql: sql, success: false, message: err.message, exception: err.message });
            }
            return;
        }

        // Fetch resulting column names and types via DESCRIBE
        try {
            const descRows = await this.executeAndGetRows(`DESCRIBE (${sql.replace(';', '')});`);
            const headers: ColumnDescription[] = descRows.map(row => ({
                column_name: String(row['column_name'] || row['name'] || ''),
                column_type: String(row['column_type'] || row['type'] || ''),
                null: String(row['null'] || ''),
                key: row['key'] ? String(row['key']) : null,
                default: row['default'] ? String(row['default']) : null,
                extra: row['extra'] ? String(row['extra']) : null,
            }));

            // Execute query with limit
            try {
                const rows = await this.executeAndGetRows(this.formatSql(sql, limit, 0));
                callback({ type: 'query', sql: sql, success: true, headers: headers, results: this.cleanResults(rows), exception: null });
            } catch (err: any) {
                callback({ type: 'query', sql: sql, success: false, message: err.message, exception: err.message });
            }
        } catch (err: any) {
            callback({ type: 'query-parse', success: false, message: err.message, exception: err.message });
        }
    }

    async fetchMore(sql: string, limit: number, offset: number, callback: (msg: IMessage) => void): Promise<void> {
        try {
            const rows = await this.executeAndGetRows(this.formatSql(sql, limit, offset));
            callback({ type: 'more', success: true, results: this.cleanResults(rows) });
        } catch (err: any) {
            callback({ type: 'more', success: false, message: err.message });
        }
    }
}
