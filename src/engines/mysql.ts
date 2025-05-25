import z from "zod";

export const MySQLConfigSchema = z.object({
  host: z.string(),
  port: z.number().int().positive(),
  user: z.string(),
  password: z.string(),
  database: z.string()
});

export interface MySQLConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}
