import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { peekOIMSlotContentService } from '../../slot/utils/peekOIMSlotContentService';

export function peekOIMBucketMemberColumnGroupValues(bucketMemberSlots: Iterable<TOIMSlot>, columnNames: readonly string[]): unknown[] {
    const memberValues: unknown[] = [];
    for (const bucketMemberSlot of bucketMemberSlots) {
        memberValues.push(peekOIMSlotContentService(bucketMemberSlot).peekColumnGroupValue(bucketMemberSlot, columnNames));
    }
    return memberValues;
}
