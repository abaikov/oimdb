export function oimAssertWholePosition(position: number): void {
    if (position === Math.trunc(position)) return;
    throw new Error(
        `OIMSlotContentBucketServiceArrayDriven: a position must be a whole number, got ${position}. `
        + 'A fraction or NaN would be read one way by the list and another by splice.',
    );
}
