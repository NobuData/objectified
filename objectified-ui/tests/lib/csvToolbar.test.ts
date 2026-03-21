import {
  buildCsvContent,
  escapeCsvCell,
} from '../../src/app/components/dashboard/ListTableToolbar';

describe('ListTableToolbar csv helpers', () => {
  it('escapeCsvCell quotes fields with commas', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
  });

  it('escapeCsvCell doubles internal quotes', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('buildCsvContent includes BOM and rows', () => {
    const csv = buildCsvContent(['A', 'B'], [
      ['1', '2'],
      ['x', 'y'],
    ]);
    expect(csv.startsWith('\uFEFFA,B')).toBe(true);
    expect(csv).toContain('1,2');
    expect(csv).toContain('x,y');
  });
});
