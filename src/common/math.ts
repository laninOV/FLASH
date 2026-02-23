export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ratio(value: number, base: number): number {
  if (base <= 0) {
    return 0;
  }
  return clamp(value / base, 0, 1);
}
