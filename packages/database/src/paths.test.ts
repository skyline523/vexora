import { describe, expect, it } from 'vitest';
import { resolveDataDir, resolveSqlitePath } from './paths';

describe('paths', () => {
  it('resolves file: urls relative to cwd', () => {
    const path = resolveSqlitePath('file:../../data/vexora.sqlite', 'F:\\repo\\apps\\server');
    expect(path.replace(/\\/g, '/').toLowerCase()).toBe('f:/repo/data/vexora.sqlite');
  });

  it('keeps absolute paths', () => {
    expect(resolveSqlitePath('file:F:/tmp/vexora.sqlite')).toMatch(/vexora\.sqlite$/);
    expect(resolveDataDir('F:\\var\\data').replace(/\\/g, '/')).toBe('F:/var/data');
  });
});
