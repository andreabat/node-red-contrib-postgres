/**
 * Extracts positional parameter names from a PostgreSQL query text.
 * Matches $1, $2, ... $N references, deduplicates them,
 * and returns them sorted numerically.
 *
 * @param query - The SQL query string to analyze
 * @returns Array of parameter names ("1", "2", ...) in sorted order
 */
export function extractNamedParams(query: string): string[] {
  const matches = query.match(/\$(\d+)/g) || [];
  const indices = matches.map(m => parseInt(m.substring(1), 10));
  // Deduplicate and sort numerically
  const uniqueIndices = [...new Set(indices)].sort((a, b) => a - b);
  return uniqueIndices.map(i => String(i));
}

/**
 * Maps a msg.params object to an ordered positional values array.
 * Uses Object.keys() insertion order to determine which param key
 * corresponds to each $N positional reference.
 *
 * @example
 * bindNamedParams("SELECT * WHERE id = $1 AND name = $2", { name: 'Alice', id: 42 })
 * // Object.keys insertion order: ["name", "id"]
 * // $1 → "name" → "Alice", $2 → "id" → 42
 * // Returns: ["Alice", 42]
 *
 * @param query - The SQL query string containing $N references
 * @param params - Object whose keys map positionally to $1, $2, etc.
 * @returns Array of values in positional order matching $1, $2, ...
 */
export function bindNamedParams(
  query: string,
  params: Record<string, any>
): any[] {
  const positionalNames = extractNamedParams(query);
  const paramKeys = Object.keys(params);
  return positionalNames.map(name => {
    const index = parseInt(name, 10) - 1;
    const key = paramKeys[index];
    return key !== undefined ? params[key] : undefined;
  });
}
