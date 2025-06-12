import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DatabaseEngine } from "../../state-manager/StateManagerTypes.js";
import { executeMySQLQuery, generateMySQLProfilingQueries } from "../../engines/mysql.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import { executeSQLiteQuery, generateSQLiteProfilingQueries } from "../../engines/sqlite.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";
import { hasMySQLTable, hasMySQLColumn } from "../../engines/mysql.js";
import { hasSQLiteTable, hasSQLiteColumn } from "../../engines/sqlite.js";

const DESCRIPTION = `Generate comprehensive exploratory data analysis (EDA) and modeling statistics for a table or specific column.

This tool provides detailed statistical profiling and data quality analysis essential for data science workflows.
It automatically generates appropriate EDA queries based on the target (table or column) and database engine.

@param {string} databaseName - Name of the configured database connection
@param {string} tableName - Name of the table to profile
@param {string} [columnName] - Optional: specific column to profile (if omitted, profiles entire table)

Table-Level Profiling (when columnName is omitted):
- Row count and basic table statistics
- Column count and data types summary
- Missing values analysis across all columns
- Memory usage estimation
- Sample data preview

Column-Level Profiling (when columnName is provided):
- Data type and column metadata
- Descriptive statistics (count, distinct values, nulls)
- Distribution analysis (min, max, mean, median, mode for numeric)
- Quartiles and percentiles for numeric columns
- Top frequent values and frequency distribution
- Missing values and data quality metrics
- Cardinality analysis (unique value ratio)
- Pattern analysis for text columns

Modeling Insights:
- Data quality indicators (completeness, uniqueness)
- Feature type recommendations (categorical, numeric, datetime)
- Potential modeling issues (high cardinality, sparse data)
- Distribution characteristics for feature engineering

Database Support:
- MySQL and SQLite engines with engine-specific optimizations
- Automatic query safety validation and read-only enforcement
- Results limited to prevent context window overflow

Examples:
- Profile entire table: tableName="customers" (no columnName)
- Profile specific column: tableName="orders", columnName="amount"
- Analyze user demographics: tableName="users", columnName="age"`;

const ProfileTableOrColumnSchema = {
    databaseName: z.string(),
    tableName: z.string(),
    columnName: z.string().optional(),
};

type EngineConfigUnion = MySQLConfig | SQLiteConfig;

export function createProfileTableOrColumnTool(stateManager: StateManager) {
  return {
    name: "profile_table_or_column",
    description: DESCRIPTION,
    inputSchema: ProfileTableOrColumnSchema,
    handler: async (input) => {
        const { databaseName, tableName, columnName } = input;

        // Get the database from the state manager
        const database = stateManager.getDatabase(databaseName);

        if (!database) {
            throw new McpError(32003, `Database ${databaseName} not found`);
        }

        const { config, engine } = database;

        const configWithType = {
            type: engine,
            ...config,
        } as EngineConfigUnion;

        if (!await hasTable(configWithType, tableName)) {
            throw new McpError(32003, `Table ${tableName} not found`);
        }

        if (columnName && !await hasColumn(configWithType, tableName, columnName)) {
            throw new McpError(32003, `Column ${columnName} not found`);
        }

        // Generate appropriate profiling queries using engine-specific functions
        const queries = generateProfilingQueries(tableName, columnName, engine);

        // Execute all queries and collect results
        const results: { [key: string]: any } = {};
        
        for (const [queryName, query] of Object.entries(queries)) {
            try {
                // Execute the query (no safety check needed for internally-generated queries)
                const result = await executeQuery(query, configWithType);

                if (result.success) {
                    results[queryName] = result.rows;
                } else {
                    results[queryName] = { error: result.error };
                }
            } catch (error) {
                results[queryName] = { error: error instanceof Error ? error.message : String(error) };
            }
        }

        // Format the comprehensive profiling report
        const report = formatProfilingReport(tableName, columnName, results, engine);

        return {
            content: [{
                type: "text",
                text: report,
            }],
        };
    },
  } as ToolDefinition<typeof ProfileTableOrColumnSchema>;
}

const hasTable = async (config: EngineConfigUnion, tableName: string) => {
    if (config.type === 'mysql') {
        return await hasMySQLTable(config, tableName);
    } else if (config.type === 'sqlite') {
        return await hasSQLiteTable(config, tableName);
    }
    throw new McpError(32003, `Unsupported engine type: ${JSON.stringify(config, null, 2)}`);
}

const hasColumn = async (config: EngineConfigUnion, tableName: string, columnName: string) => {
    if (config.type === 'mysql') {
        return await hasMySQLColumn(config, tableName, columnName);
    } else if (config.type === 'sqlite') {
        return await hasSQLiteColumn(config, tableName, columnName);
    }
    throw new McpError(32003, `Unsupported engine type: ${JSON.stringify(config, null, 2)}`);
}

const generateProfilingQueries = (tableName: string, columnName: string | undefined, engine: DatabaseEngine): Record<string, string> => {
    if (engine === 'mysql') {
        return generateMySQLProfilingQueries(tableName, columnName);
    } else if (engine === 'sqlite') {
        return generateSQLiteProfilingQueries(tableName, columnName);
    } else {
        throw new McpError(32003, `Unsupported engine type: ${engine}`);
    }
};

const formatProfilingReport = (tableName: string, columnName: string | undefined, results: Record<string, any>, engine: DatabaseEngine): string => {
    let report = columnName 
        ? `=== EDA Profile Report: ${tableName}.${columnName} ===\n\n`
        : `=== EDA Profile Report: ${tableName} (Table) ===\n\n`;

    report += `Database Engine: ${engine.toUpperCase()}\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    if (columnName) {
        // Column-level report
        if (results.basic_stats && results.basic_stats.length > 0) {
            const stats = results.basic_stats[0];
            report += `📊 BASIC STATISTICS\n`;
            report += `Total Records: ${stats.total_count}\n`;
            report += `Non-Null Records: ${stats.non_null_count}\n`;
            report += `Null Records: ${stats.null_count}\n`;
            report += `Distinct Values: ${stats.distinct_count}\n`;
            report += `Uniqueness Ratio: ${(stats.uniqueness_ratio * 100).toFixed(2)}%\n`;
            report += `Data Completeness: ${((stats.non_null_count / stats.total_count) * 100).toFixed(2)}%\n\n`;
        }

        if (results.numeric_stats && results.numeric_stats.length > 0) {
            const numStats = results.numeric_stats[0];
            if (numStats.min_value !== null) {
                report += `🔢 NUMERIC ANALYSIS\n`;
                report += `Min Value: ${numStats.min_value}\n`;
                report += `Max Value: ${numStats.max_value}\n`;
                report += `Mean Value: ${numStats.mean_value ? Number(numStats.mean_value).toFixed(2) : 'N/A'}\n\n`;
            }
        }

        if (results.top_values && results.top_values.length > 0) {
            report += `📈 TOP VALUES (Most Frequent)\n`;
            results.top_values.forEach((row: any, idx: number) => {
                report += `${idx + 1}. "${row.value}" - ${row.frequency} occurrences (${(row.percentage * 100).toFixed(2)}%)\n`;
            });
            report += '\n';
        }

        if (results.data_quality && results.data_quality.length > 0) {
            report += `✅ DATA QUALITY SUMMARY\n`;
            results.data_quality.forEach((row: any) => {
                report += `${row.data_status}: ${row.count} records\n`;
            });
            report += '\n';
        }

    } else {
        // Table-level report - focus on DATA characteristics
        if (results.table_overview && results.table_overview.length > 0) {
            const overview = results.table_overview[0];
            report += `📋 DATA OVERVIEW\n`;
            report += `Total Rows: ${overview.total_rows}\n\n`;
        }

        if (results.table_data_summary && results.table_data_summary.length > 0) {
            const dataSummary = results.table_data_summary[0];
            report += `📊 DATA CHARACTERISTICS\n`;
            report += `Total Records: ${dataSummary.total_rows}\n`;
            if (dataSummary.size_mb && dataSummary.size_mb > 0) {
                report += `Estimated Size: ${dataSummary.size_mb} MB\n`;
                
                // Add data size insights
                if (dataSummary.size_mb < 1) {
                    report += `💡 Small dataset - suitable for in-memory analysis\n`;
                } else if (dataSummary.size_mb < 100) {
                    report += `💡 Medium dataset - good for most analytics workloads\n`;
                } else {
                    report += `💡 Large dataset - consider sampling for exploratory analysis\n`;
                }
            }
            report += '\n';
        }

        if (results.sample_data && results.sample_data.length > 0) {
            report += `👀 SAMPLE DATA (First 5 rows)\n`;
            report += JSON.stringify(results.sample_data, null, 2);
            report += '\n\n';
        }

        // Add table-level modeling insights
        if (results.table_data_summary && results.table_data_summary.length > 0) {
            const dataSummary = results.table_data_summary[0];
            report += `🤖 DATA INSIGHTS\n`;
            
            if (dataSummary.total_rows < 1000) {
                report += `📈 Small dataset (${dataSummary.total_rows} rows) - ideal for detailed analysis\n`;
            } else if (dataSummary.total_rows < 100000) {
                report += `📈 Medium dataset (${dataSummary.total_rows} rows) - good for machine learning\n`;
            } else {
                report += `📈 Large dataset (${dataSummary.total_rows} rows) - consider feature sampling\n`;
            }
            
            report += `💡 Use column-level profiling to analyze individual features\n`;
            report += `💡 Schema details available via introspect_schema tool\n`;
            report += '\n';
        }
    }

    // Add modeling insights (only for column-level profiling)
    if (columnName) {
        report += `🤖 MODELING INSIGHTS\n`;
        if (results.basic_stats && results.basic_stats.length > 0) {
            const stats = results.basic_stats[0];
            const completeness = (stats.non_null_count / stats.total_count) * 100;
            const uniqueness = stats.uniqueness_ratio * 100;

            if (completeness < 70) {
                report += `⚠️ High missing data (${(100 - completeness).toFixed(1)}%) - consider imputation strategies\n`;
            }
            if (uniqueness > 95) {
                report += `⚠️ Very high cardinality (${uniqueness.toFixed(1)}%) - potential identifier column\n`;
            } else if (uniqueness < 5) {
                report += `✅ Low cardinality (${uniqueness.toFixed(1)}%) - good categorical feature candidate\n`;
            }
            if (stats.distinct_count < 10) {
                report += `✅ Few distinct values - suitable for categorical encoding\n`;
            }
        }
    }

    // Add error information if any queries failed
    const errors = Object.entries(results).filter(([_, result]) => result.error);
    if (errors.length > 0) {
        report += `\n❌ QUERY ERRORS\n`;
        errors.forEach(([queryName, result]) => {
            report += `${queryName}: ${result.error}\n`;
        });
    }

    return report;
};



const executeQuery = async (query: string, engineConfig: EngineConfigUnion) => {
    if (engineConfig.type === 'mysql') {
        return await executeMySQLQuery(query, engineConfig);
    } else if (engineConfig.type === 'sqlite') {
        return await executeSQLiteQuery(query, engineConfig);
    } else {
        throw new McpError(32003, `Unsupported engine type: ${JSON.stringify(engineConfig, null, 2)}`);
    }
} 