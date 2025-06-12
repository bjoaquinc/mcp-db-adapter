// Engine config types
import type { MySQLConfig } from '../engines/mysql.js';
import type { SQLiteConfig } from '../engines/sqlite.js';
import type { DuckDBConfig } from '../engines/duckdb.js';

export interface State {
    dbs: Record<string, DatabaseState>;
}

export type DatabaseEngine = 'mysql' | 'sqlite' | 'duckdb';



export interface DatabaseState<E extends DatabaseEngine = DatabaseEngine> {
    name: string;                       // “prod”, “hr”, …
    engine: E;             // “postgres”, “mysql”, …
    /** Internal connection info ONLY—never exposed as a resource     */
    config: EngineConfig<E>;    // host, port, creds, pool opts …
    /** Set of logical schemas living inside this DB                  */
    schemas: Record<string, SchemaState>;
}

export interface SchemaState {
    name: string;                       // “public”, “finance”, …
    /** Child objects */
    tables: Record<string, TableState>;
    /** Optional lightweight stats exposed as a resource               */
    stats?: SchemaStats;
    loaded?: boolean;                 // true if loaded from DB
    loadedAt?: number;               // timestamp of last load
}

export interface TableState {
    name: string;                       // “customers”, …
    columns: ColumnMeta[];
    /** Mutable info that can help an LLM but is cheap to cache        */
    stats?: TableStats;                 // rowCount, sizeMB, updatedAt
    loaded?: boolean;                 // true if loaded from DB
    loadedAt?: number;               // timestamp of last load
}

export interface ColumnMeta {
    name: string;
    dataType: string;                   // “VARCHAR”, “INT”, …
    nullable: boolean;
    default?: string;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
}

export interface SchemaStats { totalTables: number; totalRows?: number; }
export interface TableStats  { rowCount: number;    sizeMB?: number;   }

/**  Map each engine string literal to its own config type  */
type EngineConfig<E extends DatabaseEngine> =
    E extends 'mysql'  ? Omit<MySQLConfig, 'type'>  :
    E extends 'sqlite' ? Omit<SQLiteConfig, 'type'> :
    E extends 'duckdb' ? Omit<DuckDBConfig, 'type'> :
    never;