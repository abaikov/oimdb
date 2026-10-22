import { OIMChannelQueue } from '../OIMChannelQueue';

export function oimGetChannelQueueAtDepth<TEntry>(channelQueues: OIMChannelQueue<TEntry>[], depth: number): OIMChannelQueue<TEntry> {
    const found = channelQueues[depth];
    if (found !== undefined) return found;
    const made = new OIMChannelQueue<TEntry>();
    channelQueues[depth] = made;
    return made;
}
