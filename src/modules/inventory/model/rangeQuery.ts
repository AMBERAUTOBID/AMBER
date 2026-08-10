/**
 * Turns a two-ended slider's position into URL parameters — and, more to the
 * point, decides when NOT to send one.
 *
 * A bound left sitting on the end of its track is not a filter the visitor
 * asked for, it is the absence of one. Sending it anyway silently excludes
 * everything past the end of the track, which is invisible in the interface:
 * the odometer control labels its top stop "500,000+ mi" while the 467 lots
 * that actually read above 500,000 were being filtered out, because the
 * parameter went out whenever the OTHER end had been moved.
 *
 * Kept pure and separate from the components so the rule is stated once and
 * tested, rather than repeated in each control's submit handler.
 */
export interface Range {
  min: number;
  max: number;
}

export interface RangeParams {
  /** Absent when the lower end was never raised. */
  from?: string;
  /** Absent when the upper end is still at the top stop — "and above". */
  to?: string;
}

export function rangeParams(value: Range, bounds: Range): RangeParams {
  const params: RangeParams = {};
  if (value.min > bounds.min) params.from = String(value.min);
  if (value.max < bounds.max) params.to = String(value.max);
  return params;
}

/** Whether the control is filtering at all, i.e. whether to show it as active. */
export function isRangeActive(value: Range, bounds: Range): boolean {
  const params = rangeParams(value, bounds);
  return params.from !== undefined || params.to !== undefined;
}
