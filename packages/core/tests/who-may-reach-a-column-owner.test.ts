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
            'column/utils/createOIMPullColumnSlotOwner.ts',
            'column/utils/createOIMPushColumnSlotOwner.ts',
        ]);
        expect(filesMatching(/\bcreateOIMPullColumnSlotOwner\b/)).toEqual([
            'column/utils/createOIMPullColumnSlotOwner.ts',
            'computed/OIMBucketMemoComputedService.ts',
            'computed/OIMComputedService.ts',
            'computed/OIMSingleComputedService.ts',
            'computed/OIMSingleSourceTrackingComputedService.ts',
            'computed/OIMSortedComputedService.ts',
            'computed/OIMSourceTrackingComputedService.ts',
        ]);
        expect(filesMatching(/\bcreateOIMPushColumnSlotOwner\b/)).toEqual([
            'column/utils/createOIMPushColumnSlotOwner.ts',
            'slot/utils/oimResolveSlotOwnerServiceOptions.ts',
        ]);
    });

    it('is named by no file but those, the content owner that keeps it and the owner strategies', () => {
        expect(filesMatching(/\bOIM\w*ColumnSlotOwner\w*\b/)).toEqual([
            'bucket/types/TOIMBucketSlotOwnerService.ts',
            'column/OIMColumnSlotOwner.ts',
            'column/OIMColumnSlotService.ts',
            'column/OIMPullColumnSlotOwner.ts',
            'column/OIMPushColumnSlotOwner.ts',
            'column/utils/createOIMPullColumnSlotOwner.ts',
            'column/utils/createOIMPushColumnSlotOwner.ts',
            'computed/OIMBucketMemoComputedService.ts',
            'computed/OIMComputedService.ts',
            'computed/OIMSingleComputedService.ts',
            'computed/OIMSingleSourceTrackingComputedService.ts',
            'computed/OIMSortedComputedService.ts',
            'computed/OIMSourceTrackingComputedService.ts',
            'computed/createOIMBucketMemoComputedService.ts',
            'computed/types/TOIMBucketMemoComputedServiceOptions.ts',
            'entity/types/TOIMEntitySlotOwnerService.ts',
            'index.ts',
            'index/OIMSlotCollectionIndexService.ts',
            'index/types/TOIMSlotCollectionIndexServiceOptions.ts',
            'slot/OIMSingleSlotService.ts',
            'slot/OIMSlotCollectionService.ts',
            'slot/OIMSlotOwnerService.ts',
            'slot/OIMWritableSingleSlotService.ts',
            'slot/OIMWritableSlotCollectionService.ts',
            'slot/createOIMSingleSlotService.ts',
            'slot/createOIMSlotCollectionService.ts',
            'slot/types/TOIMSingleSlotServiceOptions.ts',
            'slot/types/TOIMSlotCollectionServiceOptions.ts',
            'slot/types/TOIMSlotOwnerServiceOptions.ts',
            'slot/utils/oimResolveSlotOwnerServiceOptions.ts',
        ]);
    });

    it('is handed out by the package as the base a content owner builds and the pull strategy, and no instance', () => {
        expect(Object.keys(core).filter(name => /ColumnSlotOwner/.test(name)).sort())
            .toEqual(['OIMColumnSlotOwner', 'OIMPullColumnSlotOwner']);
        expect(Object.getOwnPropertyNames(core.OIMDefaults).filter(name => /COLUMN_OWNER/.test(name))).toEqual([]);
    });
});
