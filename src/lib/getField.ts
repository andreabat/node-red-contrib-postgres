import { FieldType } from './types';

/**
 * Resolves a typed input value from the Node-RED context or casts it
 * to the appropriate type. Replaces the legacy JavaScript getField()
 * utility with type-safe input guards.
 *
 * @param node - The Node-RED node instance providing context().flow.get()
 *               and context().global.get()
 * @param kind - The typed input type (flow, global, num, bool, str, env)
 * @param value - The raw string value to resolve
 * @returns The resolved value (string, number, boolean, or undefined)
 */
export function getField(
  node: any,
  kind: FieldType | undefined,
  value: string | undefined
): string | number | boolean | undefined {
  switch (kind) {
    case 'flow': {
      return node.context().flow.get(value);
    }
    case 'global': {
      return node.context().global.get(value);
    }
    case 'num': {
      const n = Number(value);
      if (isNaN(n)) {
        node.warn(`Invalid numeric value "${value}" — using NaN`);
      }
      return n;
    }
    case 'bool': {
      try {
        return JSON.parse(value as string);
      } catch {
        return value === 'true';
      }
    }
    case 'str':
    default: {
      return value;
    }
  }
}