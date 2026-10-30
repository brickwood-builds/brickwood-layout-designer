import { useMemo } from 'react';
import type { Project } from '../domain/schema';
import { overheadSvg } from './overheadSvg';

interface Props {
  project: Project;
  /** Show MILS IDs and names (large view). Small thumbnails hide text. */
  labels?: boolean;
  className?: string;
}

/** Static overhead view of a project's first visible level (dashboard cards, checkpoint previews). */
export function OverheadPreview({ project, labels = false, className }: Props) {
  const svg = useMemo(() => overheadSvg(project, { labels }), [project, labels]);
  return <div className={className ? `overhead ${className}` : 'overhead'} dangerouslySetInnerHTML={{ __html: svg }} />;
}
