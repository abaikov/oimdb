import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as core from '../src/index';

const SRC = join(__dirname, '..', 'src');

const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name === 'tests') continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(path);
        }
    };
    walk(SRC);
    return found.sort();
};

const filesMatching = (pattern: RegExp): string[] => sourceFiles()
    .filter(path => pattern.test(readFileSync(path, 'utf8')))
    .map(path => relative(SRC, path).split(sep).join('/'));

describe('who may reach a column owner', () => {
    it('is built only by the owners of content slots, each in its createColumnSlotOwner, for its own slots', () => {
        expect(filesMatching(/new OIM\w*ColumnSlotOwner\(/)).toEqual([
            'engine/column/utils/createOIMPullColumnSlotOwner.ts',
            'engine/column/utils/createOIMPushColumnSlotOwner.ts',
        ]);
        expect(filesMatching(/\bcreateOIMPullColumnSlotOwner\b/)).toEqual([
            'engine/column/utils/createOIMPullColumnSlotOwner.ts',
            'facade/computed/OIMSingleComputedService.ts',
            'facade/computed/utils/createOIMComputedCollectionService.ts',
        ]);
        expect(filesMatching(/\bcreateOIMPushColumnSlotOwner\b/)).toEqual([
            'engine/column/utils/createOIMPushColumnSlotOwner.ts',
            'factories/utils/oimSlotOwnerOptionsWithDefault.ts',
        ]);
    });

    it('is named by no file but those, the content owner that keeps it and the owner strategies', () => {
        expect(filesMatching(/\bOIM\w*ColumnSlotOwner\w*\b/)).toEqual([
            'engine/bucket/types/TOIMBucketSlotOwnerService.ts',
            'engine/column/OIMColumnSlotOwner.ts',
            'engine/column/OIMPullColumnSlotOwner.ts',
            'engine/column/OIMPushColumnSlotOwner.ts',
            'engine/column/utils/createOIMPullColumnSlotOwner.ts',
            'engine/column/utils/createOIMPushColumnSlotOwner.ts',
            'engine/entity/types/TOIMEntitySlotOwnerService.ts',
            'engine/slot/OIMSlotOwnerService.ts',
            'engine/slot/types/TOIMSlotOwnerServiceOptions.ts',
            'facade/column/OIMColumnSlotService.ts',
            'facade/computed/OIMBucketMemoComputedService.ts',
            'facade/computed/OIMComputedService.ts',
            'facade/computed/OIMSingleComputedService.ts',
            'facade/computed/OIMSortedComputedService.ts',
            'facade/computed/types/TOIMBucketMemoComputedServiceOptions.ts',
            'facade/computed/utils/createOIMComputedCollectionService.ts',
            'facade/index/OIMSlotCollectionIndexService.ts',
            'facade/index/types/TOIMSlotCollectionIndexServiceOptions.ts',
            'facade/slot/OIMSingleSlotService.ts',
            'facade/slot/OIMSlotCollectionService.ts',
            'facade/slot/OIMWritableSingleSlotService.ts',
            'facade/slot/OIMWritableSlotCollectionService.ts',
            'facade/slot/types/TOIMSingleSlotServiceOptions.ts',
            'facade/slot/types/TOIMSlotCollectionServiceOptions.ts',
            'factories/createOIMBucketMemoComputedService.ts',
            'factories/createOIMSingleSlotService.ts',
            'factories/createOIMSlotCollectionService.ts',
            'factories/utils/oimSlotOwnerOptionsWithDefault.ts',
            'index.ts',
        ]);
    });

    it('is handed out by the package as the base a content owner builds and the pull strategy, and no instance', () => {
        expect(Object.keys(core).filter(name => /ColumnSlotOwner/.test(name)).sort())
            .toEqual(['OIMColumnSlotOwner', 'OIMPullColumnSlotOwner']);
        expect(Object.getOwnPropertyNames(core.OIMDefaults).filter(name => /COLUMN_OWNER/.test(name))).toEqual([]);
    });
});
