type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && !(typeof Blob !== 'undefined' && value instanceof Blob)
    && !(typeof File !== 'undefined' && value instanceof File)
    && !(value instanceof Date);
}

function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

export function toDomain<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => toDomain(item)) as T;
  if (!isPlainObject(value)) return value as T;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [camelKey(key), toDomain(item)]),
  ) as T;
}

export function toDto<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => toDto(item)) as T;
  if (!isPlainObject(value)) return value as T;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [snakeKey(key), toDto(item)]),
  ) as T;
}
