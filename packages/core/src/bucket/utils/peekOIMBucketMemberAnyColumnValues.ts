import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { peekOIMSlotContentService } from '../../slot/utils/peekOIMSlotContentService';

export function peekOIMBucketMemberAnyColumnValues(bucketMemberSlots: Iterable<TOIMSlot>): unknown[] {
    const memberValues: unknown[] = [];
    for (const bucketMemberSlot of bucketMemberSlots) {
        memberValues.push(peekOIMSlotContentService(bucketMemberSlot).peekAnyColumnValue(bucketMemberSlot));
    }
    return memberValues;
}
