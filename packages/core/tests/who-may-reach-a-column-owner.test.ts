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
    it('is built only by the owners of content slots, each in its createColumnOwner, for its own slots', () => {
        expect(filesMatching(/new OIMColumnOwner\w*\(/)).toEqual([
            'engine/column/utils/createOIMColumnOwnerPullDriven.ts',
            'engine/column/utils/createOIMColumnOwnerPushDriven.ts',
        ]);
        expect(filesMatching(/\bcreateOIMColumnOwnerPullDriven\b/)).toEqual([
            'engine/column/utils/createOIMColumnOwnerPullDriven.ts',
            'facade/computed/utils/createOIMComputedCollectionService.ts',
        ]);
        expect(filesMatching(/\bcreateOIMColumnOwnerPushDriven\b/)).toEqual([
            'engine/column/utils/createOIMColumnOwnerPushDriven.ts',
            'factories/createOIMSlotContentEntityService.ts',
            'factories/utils/createOIMBucketSlotOwnerService.ts',
        ]);
    });

    it('is named by no file but those, the content owner that keeps it and the owner strategies', () => {
        expect(filesMatching(/\bOIMColumnOwner\w*\b/)).toEqual([
            'engine/bucket/types/TOIMBucketSlotOwnerService.ts',
            'engine/column/OIMColumnOwner.ts',
            'engine/column/OIMColumnOwnerPullDriven.ts',
            'engine/column/OIMColumnOwnerPushDriven.ts',
            'engine/column/utils/createOIMColumnOwnerPullDriven.ts',
            'engine/column/utils/createOIMColumnOwnerPushDriven.ts',
            'engine/entity/OIMSlotContentEntityService.ts',
            'engine/entity/types/TOIMEntitySlotOwnerService.ts',
            'engine/entity/types/TOIMSlotContentEntityServiceOptions.ts',
            'engine/slot/OIMSlotOwnerService.ts',
            'engine/slot/types/TOIMSlotOwnerServiceOptions.ts',
            'facade/bucket/OIMSlotContentBucketService.ts',
            'facade/computed/OIMComputedService.ts',
            'facade/computed/OIMComputedServiceBucketMemo.ts',
            'facade/computed/OIMComputedServiceSorted.ts',
            'facade/computed/types/TOIMComputedServiceBucketMemoOptions.ts',
            'facade/computed/utils/createOIMComputedCollectionService.ts',
            'facade/index/OIMIndexService.ts',
            'facade/index/types/TOIMIndexServiceOptions.ts',
            'facade/slot/OIMSingleSlotService.ts',
            'facade/slot/OIMSlotCollectionService.ts',
            'facade/slot/OIMSlotColumnService.ts',
            'facade/slot/types/TOIMSingleSlotServiceOptions.ts',
            'facade/slot/types/TOIMSlotCollectionServiceOptions.ts',
            'factories/createOIMBucketService.ts',
            'factories/createOIMComputedServiceBucketMemo.ts',
            'factories/createOIMEntityService.ts',
            'factories/createOIMSingleBucketService.ts',
            'factories/createOIMSingleEntityService.ts',
            'factories/createOIMSingleSlotService.ts',
            'factories/createOIMSlotCollectionService.ts',
            'index.ts',
        ]);
    });

    it('is handed out by the package as the base a content owner builds and the pull strategy, and no instance', () => {
        expect(Object.keys(core).filter(name => /ColumnOwner/.test(name)).sort())
            .toEqual(['OIMColumnOwner', 'OIMColumnOwnerPullDriven']);
        expect(Object.getOwnPropertyNames(core.OIMDefaults).filter(name => /COLUMN_OWNER/.test(name))).toEqual([]);
    });
});
