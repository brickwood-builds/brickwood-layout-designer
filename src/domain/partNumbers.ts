// Part numbers (decision "Parts lookup source", 18 Nov 2026): BrickLink numbers are the part
// IDs shown and stored, so BrickLink and Brickwith sourcing keeps working. The parts list
// comes from Rebrickable, which numbers some parts differently (its 3070b is BrickLink's
// 3070, its 6141 is BrickLink's 4073). data/bricklink-numbers.json lists those differences
// for the bundled parts (scripts/update-bricklink-numbers.mjs); parts looked up live carry
// their BrickLink number from Rebrickable.
import DIFFERENT from '../data/bricklink-numbers.json' with { type: 'json' };

const BL_BY_RB = DIFFERENT as Record<string, string>;

/** The BrickLink number for a Rebrickable number (the same number when they agree). */
export const blFor = (rbNo: string): string => BL_BY_RB[rbNo] ?? rbNo;

/**
 * The Rebrickable number for a BrickLink number, for files meant for rebrickable.com.
 * `isRb` says whether a Rebrickable part has exactly that number (from the parts list).
 */
export function rbFor(blNo: string, isRb: (no: string) => boolean = () => false): string {
  if (isRb(blNo) && blFor(blNo) === blNo) return blNo;
  for (const [rb, bl] of Object.entries(BL_BY_RB)) if (bl === blNo) return rb;
  return blNo;
}

/** Stored on placed pieces: "bl:<BrickLink no>". Older projects stored "rb:<Rebrickable no>". */
export const blKey = (blNo: string) => `bl:${blNo}`;

/** Upgrade an older "rb:<no>" key to "bl:<no>"; other keys are returned as they are. */
export const upgradeCatalogKey = (key: string) => (key.startsWith('rb:') ? blKey(blFor(key.slice(3))) : key);
