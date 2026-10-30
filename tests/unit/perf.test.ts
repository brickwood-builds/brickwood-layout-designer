import { describe, expect, it } from 'vitest';
import { largeProject } from '../fixtures/large';
import { checkLayout } from '../../src/domain/validation';
import { moveItems, rotateItems } from '../../src/domain/edits';
import { ProjectSchema } from '../../src/domain/schema';

describe('large exhibition fixture', () => {
  const p = largeProject();
  const time = (fn: () => void) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };

  it('has a realistic size', () => {
    expect(p.modules.length).toBe(264);
    expect(p.objects.length).toBe(264 * 6);
  });

  it('layout checks, moves and validation stay fast', () => {
    checkLayout(p); // warm up
    const check = time(() => expect(checkLayout(p)).toEqual([]));
    const ids = p.modules.slice(0, 50).map((m) => m.id);
    const move = time(() => moveItems(p, ids, 1, 0));
    const rotate = time(() => rotateItems(p, ids, 1, 'full'));
    const validate = time(() => ProjectSchema.parse(p));
    console.log(`checkLayout ${check.toFixed(1)} ms, move ${move.toFixed(1)} ms, rotate ${rotate.toFixed(1)} ms, validate ${validate.toFixed(1)} ms`);
    // Generous ceilings (CI machines vary); typical numbers are logged above.
    expect(check).toBeLessThan(250);
    expect(move).toBeLessThan(50);
    expect(rotate).toBeLessThan(50);
    expect(validate).toBeLessThan(250);
  });
});
