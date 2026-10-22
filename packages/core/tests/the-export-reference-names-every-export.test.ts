import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const exportedNames = (): string[] => {
    const source = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const names = new Set<string>();
    for (const statement of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of statement[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name !== undefined && name.length > 0) names.add(name);
        }
    }
    return [...names].sort();
};

const readme = (): string => readFileSync(join(__dirname, '..', 'README.md'), 'utf8');

describe('the export reference names every export', () => {
    it('reads a surface big enough to be the real one', () => {
        expect(exportedNames().length).toBeGreaterThan(50);
    });

    it('names every exported symbol', () => {
        const unnamed = exportedNames().filter(name => !readme().includes(`\`${name}\``));
        expect(unnamed).toEqual([]);
    });

    it('states the count it actually lists', () => {
        const stated = /\*\*(\d+) names\. This list is `src\/index\.ts`/.exec(readme());
        expect(stated).not.toBeNull();
        expect(Number(stated?.[1])).toBe(exportedNames().length);
    });
});
