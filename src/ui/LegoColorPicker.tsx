import { Fragment, useState } from 'react';
import { LEGO_COLORS, legoColorName } from '../domain/legoColors';

/** Pick from real LEGO colours only (no gradient picker). */
export function LegoColorPicker({
  label,
  value,
  onChange,
  allowNone,
  madeIn,
}: {
  label: string;
  value: string | undefined;
  onChange: (hex: string | undefined) => void;
  allowNone?: string;
  /** Colour names this part has been made in: shown first, the rest faded. */
  madeIn?: string[];
}) {
  const [open, setOpen] = useState(false);
  const made = madeIn?.length ? LEGO_COLORS.filter((c) => madeIn.includes(c.name)) : LEGO_COLORS;
  const ordered = madeIn?.length ? [...made, ...LEGO_COLORS.filter((c) => !madeIn.includes(c.name))] : LEGO_COLORS;
  const madeCount = made.length;
  const name = value ? (legoColorName(value) ?? 'Custom colour') : (allowNone ?? 'None');
  return (
    <div className="field lego-picker">
      <span>{label}</span>
      <button type="button" className="lego-current" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i className="swatch" style={{ background: value ?? 'transparent' }} />
        {name}
      </button>
      {open && (
        <div className="lego-grid" role="listbox" aria-label={`${label}: LEGO colours`}>
          {allowNone && (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className="lego-none"
              title={allowNone}
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              ∅
            </button>
          )}
          {madeIn && madeIn.length > 0 && <span className="made-label">Made in these colours</span>}
          {ordered.map((c, i) => {
            const notMade = !!madeIn?.length && !madeIn.includes(c.name);
            return (
              <Fragment key={c.hex}>
                {notMade && i === madeCount && <span className="made-label">Not made in this part</span>}
                <button
                  type="button"
                  role="option"
                  className={notMade ? 'not-made' : undefined}
                  aria-selected={value?.toLowerCase() === c.hex}
                  aria-label={notMade ? `${c.name} (not made in this part)` : c.name}
                  title={notMade ? `${c.name} — not made in this part` : c.name}
                  style={{ background: c.hex }}
                  onClick={() => {
                    onChange(c.hex);
                    setOpen(false);
                  }}
                />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
