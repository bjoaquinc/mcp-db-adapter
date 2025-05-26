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