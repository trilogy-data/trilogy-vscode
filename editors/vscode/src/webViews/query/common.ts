
import { TableData } from "duckdb";
export interface ColumnDescription {
    column_name: string;
    column_type: string;
    null: string;
    key: string | null;
    default: string | null;
    extra: string | null;
}

export interface IMessage {
    type: 'query' | 'more' | 'query-parse' | 'query-start';
    success: boolean;
    sql?: string
    message?: string;
    exception?: string | null;
    results?: TableData;
    headers?: ColumnDescription[];
}


