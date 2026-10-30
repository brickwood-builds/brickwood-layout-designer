// Studs are the canonical horizontal unit; plates the canonical vertical unit.
// Inches and centimetres are derived presentation units only.

export const MM_PER_STUD = 8;
export const MM_PER_INCH = 25.4;
/** Exact physical scale: 32 studs = 10.08 in. */
export const STUDS_PER_INCH = MM_PER_INCH / MM_PER_STUD; // 3.175
/** Scale used by the owner's Visio drawings (10 in = 32 studs). Import-only. */
export const VISIO_STUDS_PER_INCH = 3.2;

export const studsToInches = (studs: number) => (studs * MM_PER_STUD) / MM_PER_INCH;
export const inchesToStuds = (inches: number) => inches * STUDS_PER_INCH;
export const studsToCm = (studs: number) => (studs * MM_PER_STUD) / 10;

export type DisplayUnit = 'studs' | 'in' | 'cm';

export function formatLength(studs: number, unit: DisplayUnit): string {
  switch (unit) {
    case 'studs':
      return `${+studs.toFixed(2)} studs`;
    case 'in':
      return `${studsToInches(studs).toFixed(1)} in`;
    case 'cm':
      return `${studsToCm(studs).toFixed(1)} cm`;
  }
}

/** Feet-and-inches form used for table sizes, e.g. 3 ft 6 in. */
export function formatFeetInches(studs: number): string {
  const total = Math.round(studsToInches(studs));
  const ft = Math.floor(total / 12);
  const inch = total % 12;
  return inch === 0 ? `${ft} ft` : `${ft} ft ${inch} in`;
}
