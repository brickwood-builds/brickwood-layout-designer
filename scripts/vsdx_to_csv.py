"""Dump the top-level shapes of one Visio page as rows for docs/brickwood-visio-layouts.csv.

Usage: python3 scripts/vsdx_to_csv.py <unzipped .vsdx dir> <pageN.xml> <display name>
Unzip first: unzip "file.vsdx" -d out. Columns match the CSV: centre x/y, width/height in inches,
angle in radians, fill. Text line breaks become " | " and commas ";".
"""
import sys, re, xml.etree.ElementTree as ET
NS = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
root_dir, page_file, display = sys.argv[1], sys.argv[2], sys.argv[3]

def cells(el):
    return {c.get('N'): c.get('V') for c in el.findall('v:Cell', NS)}

masters = {}
mx = ET.parse(f'{root_dir}/visio/masters/masters.xml').getroot()
rels = open(f'{root_dir}/visio/masters/_rels/masters.xml.rels').read()
relmap = dict(re.findall(r'Id="(\w+)"[^>]*Target="([^"]+)"', rels)) or {b: a for a, b in re.findall(r'Target="([^"]+)"[^>]*Id="(\w+)"', rels)}
for m in mx.findall('v:Master', NS):
    rid = m.find('v:Rel', NS).get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    t = ET.parse(f'{root_dir}/visio/masters/{relmap[rid]}').getroot()
    shp = t.find('.//v:Shape', NS)
    masters[m.get('ID')] = (m.get('NameU'), cells(shp) if shp is not None else {})

page = ET.parse(f'{root_dir}/visio/pages/{page_file}').getroot()
shapes = page.find('v:Shapes', NS)

for s in shapes.findall('v:Shape', NS):
    base = masters.get(s.get('Master'), ('', {}))
    c = {**base[1], **cells(s)}
    text_el = s.find('v:Text', NS)
    text = ''.join(text_el.itertext()).strip() if text_el is not None else ''
    text = re.sub(r'\s*\n\s*', ' | ', text).replace(',', ';')
    f = lambda k: float(c.get(k) or 0)
    print(f"{display},{text},{f('PinX'):.3f},{f('PinY'):.3f},{f('Width'):.3f},{f('Height'):.3f},{f('Angle'):.3f},{(c.get('FillForegnd') or '').lower()}")
