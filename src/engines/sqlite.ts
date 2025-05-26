import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import z from "zod";

export const SQLiteConfigSchema = z.object({
  file: z.string(),           // allow ':memory:'
  readonly: z.boolean().optional(),
  type: z.literal('sqlite'),
});

export interface SQLiteConfig {
  file: string;          // absolute path or `:memory:`
  readonly?: boolean;
  type: 'sqlite';
}

export const checkSqliteConnection = async (dbName: string, config: Omit<SQLiteConfig, 'type'>): Promise<boolean> => {
  const mode = config.readonly
    ? sqlite3.OPEN_READONLY
    : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
      
  try {
    // 3) Open & ping
    const db = await open({
      filename: config.file,
      driver: sqlite3.Database,
      mode,
    });

    // The cheapest “is-alive?” query you can do:
    await db.get('PRAGMA quick_check;');

    // 4) Clean shutdown
    await db.close();
    return true;
  } catch (err) {
    // Log once, return false so callers can decide how noisy to be
    console.error(`[${dbName}] SQLite handshake failed:`, err);
    return false;
  }
}