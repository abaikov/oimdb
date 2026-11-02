import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');

const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
});

describe('who may change the set of a bucket', () => {
    it('hands every other file a read-only set, so the compiler refuses a change anywhere but the set service', () => {
        expect(readFileSync(join(SRC, 'bucket/types/TOIMBucketSlotsSetStore.ts'), 'utf8')).toContain('ReadonlySet<TBucketMemberSlot>');
    });

    it('is the set service alone that turns a bucket member set back into a mutable one', () => {
        const unlockers = sourceFiles(SRC)
            .filter(path => /TOIMBucketSlotsSetStore/.test(readFileSync(path, 'utf8')))
            .filter(path => /\bas Set</.test(readFileSync(path, 'utf8')))
            .map(path => relative(SRC, path));
        expect(unlockers).toEqual(['bucket/set/OIMBucketMemberSlotsSetService.ts']);
    });
});
