import * as vscode from 'vscode';
import { Disposable } from '../dispose';

import { Database, TableData } from "duckdb";
import { ColumnDescription, IMessage } from './common';



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
    private _db: any;

    private constructor(uri: vscode.Uri) {
        super();
        this._uri = uri;
        // this._db = null;
        // Database.create(":memory:").then((db) => {
        //     this._db = db 
        // });

        const config = vscode.workspace.getConfiguration('trilogy');
    }
    private async init() {
        this._db = new Database(':memory:');
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

    private cleanResults(results: TableData): TableData {
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
        // check if it is a CALL statement
        const checkSQL = sql.toLowerCase().trim();
        if (checkSQL.startsWith('call') || checkSQL.startsWith('install')  || checkSQL.startsWith('load')) {
            callback({ type: 'query-parse', success: true, message: 'finished-parse' });
            this.db.all(
                sql,
                (err: Error, res: any[]) => {
                    if (err) {
                        callback({ type: 'query', 'sql': sql, success: false, message: err.message, exception:err.message });
                        return;
                    }
                    callback({ type: 'query', headers:[], 'sql': sql, success: true, results: this.cleanResults(res), exception: null });
                }
            );
            return;
        }

        // Fetch resulting column names and types

        this.db.all(
            `DESCRIBE (${sql.replace(';', '')});`,
            (err: Error, descRes: ColumnDescription[]) => {
                if (err) {
                    callback({ type: 'query-parse', success: false, message: err.message , exception:err.message });
                    return;
                }

                // Execute query
                this.db.all(
                    this.formatSql(sql, limit, 0),
                    (err: Error, res: any[]) => {
                        if (err) {
                            callback({ type: 'query', 'sql': sql,  success: false, message: err.message, exception:err.message });
                            return;
                        }
                        callback({ type: 'query', 'sql': sql, success: true, headers: descRes, results: this.cleanResults(res), exception: null });
                    }
                );
            }
        );
    }

    fetchMore(sql: string, limit: number, offset: number, callback: (msg: IMessage) => void): void {
        this.db.all(
            this.formatSql(sql, limit, offset),
            (err:Error, res:any[]) => {
                if (err) {
                    callback({ type: 'more', success: false, message: err.message });
                    return;
                }
                callback({ type: 'more', success: true, results: this.cleanResults(res) });
            }
        );
    }
}
