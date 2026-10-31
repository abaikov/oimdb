import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(__dirname, '..', 'dist');
const declarations = ['oim.d.ts', 'oim.d.cts', 'oimdb.d.ts', 'oimdb.d.cts'].filter(name => existsSync(join(DIST, name)));

describe('every name the oim entry declares resolves', () => {
    if (declarations.length === 0) {
        it.skip('over dist/oim.d.ts — not built', () => undefined);
        return;
    }
    it.each(declarations)('%s imports or declares every OIM name it uses', declaration => {
        const text = readFileSync(join(DIST, declaration), 'utf8');
        const imported = new Set([...text.matchAll(/^import (?:type )?\{([^}]*)\} from '@oimdb\/core';$/gm)]
            .flatMap(match => match[1].split(',').map(name => name.replace(/^\s*type\s+/, '').trim())));
        const declared = new Set([...text.matchAll(/^declare (?:class|function|const|type|interface) (\w+)/gm)].map(match => match[1]));
        const namespaces = [...text.matchAll(/^import \* as (\w+) from '@oimdb\/core';$/gm)].map(match => match[1]);
        const used = new Set([...text.matchAll(/(?<![\w.])((?:T|I)?OIM\w+|createOIM\w+|oim[A-Z]\w*)\b/g)].map(match => match[1]));
        expect(namespaces.every(name => /^_oimdb_core$/.test(name))).toBe(true);
        expect([...used].filter(name => !imported.has(name) && !declared.has(name)).sort()).toEqual([]);
    });
});
