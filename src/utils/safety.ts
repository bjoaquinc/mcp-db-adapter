export interface DatabaseSafetyConfig {
  /** Database-specific dangerous patterns */
  dangerousPatterns: RegExp[];
  /** Additional dangerous keywords specific to this database */
  dangerousKeywords?: string[];
  /** Maximum allowed nested parentheses depth */
  maxNestedDepth?: number;
}

export function isSafeSQLQuery(
  query: string, 
  engineConfig: DatabaseSafetyConfig
): boolean {
  // Normalize the query: trim, convert to lowercase, remove comments
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    // Remove single-line comments (-- comment)
    .replace(/--.*$/gm, '')  
    // Remove multi-line comments (/* comment */)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Check for empty query after normalization
  if (!normalizedQuery) {
    return false;
  }

  // Split by semicolon to check for multiple statements
  const statements = normalizedQuery.split(';').filter(stmt => stmt.trim());
  
  // If more than one non-empty statement, it's potentially unsafe
  if (statements.length > 1) {
    return false;
  }

  const stmt = statements[0].trim();

  // Must start with SELECT
  if (!stmt.startsWith('select')) {
    return false;
  }

  // Universal dangerous patterns (apply to all databases)
  const universalDangerousPatterns = [
    // Data modification within subqueries or CTEs
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bdrop\b/,
    /\bcreate\b/,
    /\balter\b/,
    /\btruncate\b/,
    /\breplace\b/,
    
    // Common Table Expressions that might contain modifications
    /\bwith\s+.*\b(insert|update|delete|create|drop|alter)\b/,
  ];

  // Check universal patterns
  for (const pattern of universalDangerousPatterns) {
    if (pattern.test(stmt)) {
      return false;
    }
  }

  // Check engine-specific dangerous patterns
  for (const pattern of engineConfig.dangerousPatterns) {
    if (pattern.test(stmt)) {
      return false;
    }
  }

  // Check engine-specific dangerous keywords
  if (engineConfig.dangerousKeywords) {
    for (const keyword of engineConfig.dangerousKeywords) {
      const keywordPattern = new RegExp(`\\b${keyword.toLowerCase()}\\b`);
      if (keywordPattern.test(stmt)) {
        return false;
      }
    }
  }

  // Additional check: ensure it's a simple SELECT without complex nested operations
  // Count parentheses to detect complex nesting that might hide dangerous operations
  const openParens = (stmt.match(/\(/g) || []).length;
  const closeParens = (stmt.match(/\)/g) || []).length;
  
  // Unbalanced parentheses indicate malformed query
  if (openParens !== closeParens) {
    return false;
  }

  // Check nesting depth limit (default to 10 if not specified)
  const maxDepth = engineConfig.maxNestedDepth ?? 10;
  if (openParens > maxDepth) {
    return false;
  }

  return true;
} 