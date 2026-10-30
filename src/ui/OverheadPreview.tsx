import { footprint, levelBounds } from '../domain/geometry';
import { MILS_COLORS, type Project } from '../domain/schema';

interface Props {
  project: Project;
  /** Show MILS IDs and names (large view). Small thumbnails hide text. */
  labels?: boolean;
  className?: string;
}

const MARGIN = 4; // studs

/** Font size (studs) that keeps a one-line label inside its rectangle. */
function fitText(text: string, width: number, depth: number, max: number) {
  return Math.min(max, depth * 0.45, (width * 0.9) / Math.max(1, text.length * 0.6));
}

/** Static overhead view of a project's first visible level. Pure SVG, studs as user units. */
export function OverheadPreview({ project, labels = false, className }: Props) {
  const level = project.levels.find((l) => l.visible) ?? project.levels[0]!;
  const b = levelBounds(project, level.id) ?? { x: 0, y: 0, width: 64, depth: 32 };
  const visibleLayers = new Set(project.layers.filter((l) => l.visible).map((l) => l.id));
  const onLevel = <T extends { levelId: string; layerId: string }>(xs: T[]) =>
    xs.filter((x) => x.levelId === level.id && visibleLayers.has(x.layerId));

  return (
    <svg
      className={className}
      viewBox={`${b.x - MARGIN} ${b.y - MARGIN} ${b.width + MARGIN * 2} ${b.depth + MARGIN * 2}`}
      role="img"
      aria-label={`Overhead view of ${project.name}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {onLevel(project.tables).map((t) => {
        const r = footprint(t);
        return <rect key={t.id} className="pv-table" x={r.x} y={r.y} width={r.width} height={r.depth} rx={1.5} />;
      })}
      {onLevel(project.modules).map((m) => {
        const r = footprint(m);
        return (
          <g key={m.id} data-label={m.label}>
            <rect className="pv-module" x={r.x} y={r.y} width={r.width} height={r.depth} fill={m.color ?? MILS_COLORS[m.kind]} />
            {labels && (
              <text className="pv-label" x={r.x + r.width / 2} y={r.y + r.depth / 2} fontSize={fitText(m.label, r.width, r.depth, 5)}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}
      {onLevel(project.objects).map((o) => {
        const r = footprint(o);
        return (
          <g key={o.id}>
            <rect
              className={o.type === 'footprint' ? 'pv-footprint' : 'pv-item'}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.depth}
              fill={o.color}
            />
            {labels && o.type === 'footprint' && (
              <text className="pv-name" x={r.x + r.width / 2} y={r.y + r.depth / 2} fontSize={fitText(o.name, r.width, r.depth, 6)}>
                {o.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
