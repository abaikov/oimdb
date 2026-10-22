export function oimIsRevisionAfter(
    revision: number, epoch: number, sinceRevision: number, sinceEpoch: number,
): boolean {
    if (epoch !== sinceEpoch) return epoch > sinceEpoch;
    return revision > sinceRevision;
}