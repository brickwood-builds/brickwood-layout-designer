import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { addContainer, packItems, updateContainer } from '../../src/domain/packing';
import { boxUrl, checklistHtml, labelsHtml, qrSvg } from '../../src/ui/labels';

describe('labels', () => {
  it('a label has the ID, contents, handling note and a QR code for lookup', () => {
    const p0 = createProject({ name: 'Park <&>', table: { widthIn: 30, depthIn: 30 } });
    const m = addModule(p0, { levelId: p0.levels[0]!.id, kind: '16x16', center: { x: 8, y: 8 }, exact: true }, 'full');
    const c = addContainer(m.project, { kind: 'tote', name: 'Modules', weightLb: 12 });
    let p = packItems(c.project, c.id, [m.id]);
    p = updateContainer(p, c.id, { handling: 'This side up' });
    const html = labelsHtml(p, p.containers, 'https://example.test/app/');
    expect(html).toContain('BX-001');
    expect(html).toContain('<li>B-01</li>');
    expect(html).toContain('⚠ This side up');
    expect(html).toContain('Park &lt;&amp;&gt;');
    expect(html).toContain('<svg');
    expect(boxUrl(p.id, 'BX-001', 'https://example.test/app/')).toBe(`https://example.test/app/#/project/${p.id}/box/BX-001`);
    expect(qrSvg('hello')).toMatch(/^<svg/);
    expect(checklistHtml('List', [{ heading: 'A', rows: [{ label: 'BX-001', contents: ['B-01'], ticks: [true, false] }] }], ['Packed', 'Loaded'])).toContain('✔');
  });
});
