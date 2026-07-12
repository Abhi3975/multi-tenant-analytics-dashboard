/**
 * Simple, dependency-free anomaly detection using the z-score (standard-score)
 * method: a point is anomalous when it sits more than `threshold` standard
 * deviations from the series mean.
 *
 * z = (value - mean) / stddev,  anomaly when |z| > threshold
 *
 * This is cheap, explainable, and works well for the roughly-stationary metric
 * streams here. For strongly trending data a rolling/seasonal model would be a
 * better fit (a Tier 3 concern).
 */
export const DEFAULT_ANOMALY_THRESHOLD = 2.5;

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[], avg = mean(values)): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** z-score of a single value against a series' mean/stddev. */
export function zScore(
  value: number,
  avg: number,
  sd: number
): number {
  if (sd === 0) return 0;
  return (value - avg) / sd;
}

/**
 * Returns a boolean per input value marking anomalies. Needs a few points to be
 * meaningful, so series shorter than 4 are all treated as normal.
 */
export function detectAnomalies(
  values: number[],
  threshold = DEFAULT_ANOMALY_THRESHOLD
): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const avg = mean(values);
  const sd = stddev(values, avg);
  if (sd === 0) return values.map(() => false);
  return values.map((v) => Math.abs((v - avg) / sd) > threshold);
}
