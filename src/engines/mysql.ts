import mysql from "mysql2/promise"
import z from "zod";

export const MySQLConfigSchema = z.object({
  type: z.literal('mysql'),
  host: z.string(),
  port: z.number(),
  user: z.string(),
  password: z.string(),
  database: z.string()
});

export interface MySQLConfig {
  type: 'mysql';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export const checkMySqlConnection = async (
  config: MySQLConfig,
): Promise<boolean> => {
  let conn: mysql.Connection | undefined;

  try {
    // 1) Open
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      // keep it snappy — tweak if you expect slow networks
      connectTimeout: 5_000,
    });

    // 2) Ping with the lightest-weight query possible
    await conn.query('SELECT 1');

    // 3) Clean shutdown
    await conn.end();
    return true;
  } catch (err) {
    // console.error(`[${dbName}] MySQL handshake failed:`, err);
    if (conn) await conn.end().catch(() => void 0);
    return false;
  }
};


