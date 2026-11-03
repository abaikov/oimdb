export function getOIMBucketMemberSlotEntities<TEntity extends object>(
    bucketMemberSlots: Iterable<{ readonly entity: TEntity | undefined }>,
): TEntity[] {
    const entities: TEntity[] = [];
    for (const bucketMemberSlot of bucketMemberSlots) {
        const entity = bucketMemberSlot.entity;
        if (entity !== undefined) entities.push(entity);
    }
    return entities;
}
