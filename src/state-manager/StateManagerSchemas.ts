import { z } from 'zod';
import type {
  State,
  DatabaseState,
  SchemaState,
  TableState,
  ColumnMeta,
} from './StateManagerTypes.js';

/* ---------- Engine-specific configs ---------- */
import { MySQLConfigSchema } from '../engines/mysql.js';
import { SQLiteConfigSchema } from '../engines/sqlite.js';

/* ---------- Column & table ---------- */
export const ColumnMetaSchema: z.ZodSchema<ColumnMeta> = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  default: z.string().optional(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional()
});

export const TableStateSchema: z.ZodSchema<TableState> = z.object({
  name: z.string(),
  columns: z.array(ColumnMetaSchema),
  stats: z.object({
    rowCount: z.number(),
    sizeMB: z.number().optional()
  }).optional()
});

/* ---------- Schema (namespace) ---------- */
export const SchemaStateSchema: z.ZodSchema<SchemaState> = z.object({
  name: z.string(),
  tables: z.record(TableStateSchema),
  stats: z.object({
    totalTables: z.number(),
    totalRows: z.number().optional()
  }).optional()
});

/* ---------- Database + conditional config ---------- */
export const DatabaseStateSchema: z.ZodSchema<DatabaseState> = z.discriminatedUnion('engine', [
  z.object({
    name: z.string(),
    engine: z.literal('mysql'),
    config: MySQLConfigSchema.omit({type: true}),
    schemas: z.record(SchemaStateSchema)
  }),
  z.object({
    name: z.string(),
    engine: z.literal('sqlite'),
    config: SQLiteConfigSchema.omit({type: true}),
    schemas: z.record(SchemaStateSchema)
  })
]);

// Schema objects for tools (shape or raw shape no zod object)

/* ---------- Whole store ---------- */
export const StateSchema: z.ZodSchema<State> =
  z.object({ dbs: z.record(DatabaseStateSchema) });
