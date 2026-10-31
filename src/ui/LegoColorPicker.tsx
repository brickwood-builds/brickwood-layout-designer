import { useState } from 'react';
import { LEGO_COLORS, legoColorName } from '../domain/legoColors';

/** Pick from real LEGO colours only (no gradient picker). */
export function LegoColorPicker({ label, value, onChange, allowNone }: { label: string; value: string | undefined; onChange: (hex: string | undefined) => void; allowNone?: string }) {
  const [open, setOpen] = useState(false);
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
          {LEGO_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="option"
              aria-selected={value?.toLowerCase() === c.hex}
              aria-label={c.name}
              title={c.name}
              style={{ background: c.hex }}
              onClick={() => {
                onChange(c.hex);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
