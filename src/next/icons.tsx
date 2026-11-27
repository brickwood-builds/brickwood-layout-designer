// Simple line icons for the trial interface (24×24, drawn with the text colour).
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
  back: 'M15 18l-6-6 6-6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  cursor: 'M5 3l14 8-6 2-2 6z',
  hand: 'M8 13V6a1.5 1.5 0 013 0v5m0-6a1.5 1.5 0 013 0v6m0-5a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L8 15',
  pencil: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  eraser: 'M7 20h13M5 15l9-9 5 5-8 8H8z',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  rotate: 'M20 12a8 8 0 11-3-6.3M20 4v5h-5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  shape: 'M5 5h8l6 6v8H5z M13 5v6h6',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 100 18 9 9 0 000-18z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5',
  group: 'M3 3h8v8H3zM13 13h8v8h-8zM11 7h6v6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  table: 'M3 7h18v3H3zM5 10v9M19 10v9',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  turn: 'M4 12a8 8 0 0114-5.3M18 3v4h-4M12 12l5-3',
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="nx-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
