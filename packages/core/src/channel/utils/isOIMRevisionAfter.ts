export function isOIMRevisionAfter(
    revision: number, epoch: number, sinceRevision: number, sinceEpoch: number,
): boolean {
    if (epoch !== sinceEpoch) return ((epoch - sinceEpoch) | 0) > 0;
    return revision > sinceRevision;
}