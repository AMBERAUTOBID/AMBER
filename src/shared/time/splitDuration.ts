/**
 * A duration in milliseconds, split into the units a countdown prints.
 *
 * Extracted so the two countdowns on this site cannot drift apart. A result
 * card and the vehicle page show the same sale, often within one click of each
 * other, and two copies of this arithmetic is exactly how "2d 4h" ends up
 * beside "2d 5h" with nothing to say which is right.
 *
 * Negative input clamps to zero. A sale that has already run has no time left,
 * and "−3h" is not something a countdown should ever be able to render.
 */
export function splitDuration(ms: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}
