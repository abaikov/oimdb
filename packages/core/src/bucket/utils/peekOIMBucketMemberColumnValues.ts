import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { peekOIMSlotContentService } from '../../slot/utils/peekOIMSlotContentService';

export function peekOIMBucketMemberColumnValues(bucketMemberSlots: Iterable<TOIMSlot>, columnName: string): unknown[] {
    const memberValues: unknown[] = [];
    for (const bucketMemberSlot of bucketMemberSlots) {
        memberValues.push(peekOIMSlotContentService(bucketMemberSlot).peekColumnValue(bucketMemberSlot, columnName));
    }
    return memberValues;
}
