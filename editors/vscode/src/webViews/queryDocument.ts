import * as vscode from 'vscode';
import { Disposable } from './dispose';

import * as duckdb from 'duckdb';

export interface IMessage {
    type: 'query' | 'more';
    success: boolean;
    message?: string;
    results?: duckdb.TableData;
    describe?: duckdb.TableData;
}


export class QueryDocument extends Disposable implements vscode.CustomDocument {

    static async create(
        uri: vscode.Uri,
        backupId: string | undefined,
    ): Promise<QueryDocument | PromiseLike<QueryDocument>> {
        // If we have a backup, read that. Otherwise read the resource from the workspace
        const trueURI = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
        return new QueryDocument(trueURI);
    }

    private readonly _uri: vscode.Uri;
    private readonly _db: duckdb.Database;

    private constructor(uri: vscode.Uri) {
        super();
        this._uri = uri;
        this._db = new duckdb.Database(':memory:');
        const config = vscode.workspace.getConfiguration('trilogy')
    }

    public get uri() { return this._uri; }
    public get db() { return this._db; }

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
        super.dispose();
    }

    private formatSql(sql: string, limit: number, offset: number): string {
        return `SELECT * FROM (\n${sql.replace(';', '')}\n) LIMIT ${limit} OFFSET ${offset}`;
    }

    private cleanResults(results: duckdb.TableData): duckdb.TableData {
        // DuckDB can sometimes give us BigInt values, which won't JSON.stringify
        // https://github.com/duckdb/duckdb-node/blob/f9a910d544835f55dac36485d767b1c2f6aafb87/src/statement.cpp#L122
        for (const row of results) {
            for (const [key, value] of Object.entries(row)) {
                if (typeof value == "bigint")
                    row[key] = Number(value);
            }
        }
        return results;
    }

    runQuery(sql: string, limit: number, callback: (msg: IMessage) => void): void {
        // Fetch resulting column names and types
        this.db.all(
            `DESCRIBE (${sql.replace(';', '')});`,
            (err, descRes) => {
                if (err) {
                    callback({ type: 'query', success: false, message: err.message });
                    return;
                }

                // Execute query
                this.db.all(
                    this.formatSql(sql, limit, 0),
                    (err, res) => {
                        if (err) {
                            callback({ type: 'query', success: false, message: err.message });
                            return;
                        }
                        callback({ type: 'query', success: true, results: this.cleanResults(res), describe: descRes });
                    }
                );
            }
        );
    }

    fetchMore(sql: string, limit: number, offset: number, callback: (msg: IMessage) => void): void {
        this.db.all(
            this.formatSql(sql, limit, offset),
            (err, res) => {
                if (err) {
                    callback({ type: 'more', success: false, message: err.message });
                    return;
                }
                callback({ type: 'more', success: true, results: this.cleanResults(res) });
            }
        );
    }
}
