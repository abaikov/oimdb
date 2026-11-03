import { OIMChannelQueue } from '../OIMChannelQueue';

export function getOIMChannelQueueAtDepth<TEntry>(channelQueues: OIMChannelQueue<TEntry>[], depth: number): OIMChannelQueue<TEntry> {
    const existingChannelQueue = channelQueues[depth];
    if (existingChannelQueue !== undefined) return existingChannelQueue;
    const channelQueue = new OIMChannelQueue<TEntry>();
    channelQueues[depth] = channelQueue;
    return channelQueue;
}
