export function stringifyError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

export function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError";
}
