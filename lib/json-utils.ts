/**
 * Utility functions for JSON serialization that handle BigInt values
 * 
 * BigInt values cannot be serialized with JSON.stringify() by default.
 * This utility provides a safe stringify function that converts BigInt to strings.
 */

/**
 * Safely stringify an object that may contain BigInt values
 * Converts BigInt values to strings (optionally with 'n' suffix for clarity)
 * 
 * @param obj - The object to stringify
 * @param space - Optional spacing for pretty printing (same as JSON.stringify)
 * @param bigIntAsString - If true, converts BigInt to string without 'n' suffix (default: true)
 * @returns JSON string with BigInt values converted to strings
 */
export function safeStringify(
  obj: any,
  space?: number | string,
  bigIntAsString: boolean = true
): string {
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'bigint') {
        // Convert BigInt to string
        // If bigIntAsString is true, return as plain string (for API compatibility)
        // Otherwise, add 'n' suffix to indicate it was a BigInt
        return bigIntAsString ? value.toString() : `${value.toString()}n`
      }
      return value
    },
    space
  )
}

/**
 * Replacer function for JSON.stringify that handles BigInt values
 * Can be used directly as the replacer parameter in JSON.stringify
 * 
 * @param key - The property key
 * @param value - The property value
 * @returns The value, with BigInt converted to string
 */
export function bigIntReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}
