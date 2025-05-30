/**
 * Deeply compares two values for equality.
 * Supports primitives, arrays, plain objects, Dates, and RegExps.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
    // Strict equality covers primitives and functions
    if (a === b) return true;

    // Handle cases where one is null/undefined
    if (a == null || b == null) return a === b;

    // Compare Dates
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    // Compare RegExps
    if (a instanceof RegExp && b instanceof RegExp) {
        return a.source === b.source && a.flags === b.flags;
    }

    // Compare arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
        if (!deepEquals(a[i], b[i])) return false;
        }
        return true;
    }

    // Compare plain objects
    if (isPlainObject(a) && isPlainObject(b)) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        // Ensure same set of keys
        for (const key of aKeys) {
        if (!bKeys.includes(key)) return false;
        if (!deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
            return false;
        }
        }
        return true;
    }

    // Fallback: not equal
    return false;
}
  
  /** Type-guard for “plain” JS objects (not Array, Date, RegExp, etc.) */
  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype
    );
  }
  