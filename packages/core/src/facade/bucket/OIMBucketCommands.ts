import type { IOIMBucketCommands } from '../../engine/bucket/commands/interfaces/IOIMBucketCommands';
import type { TOIMBucketCommandsOptions } from './types/TOIMBucketCommandsOptions';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMChannelSlot } from '../../engine/channel/types/TOIMChannelSlot';
import type { TOIMOrderedListCommand } from '../../engine/bucket/commands/types/TOIMOrderedListCommand';
import type { TOIMSlotEditable } from '../../engine/slot/types/TOIMSlotEditable';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../engine/slot/types/TOIMStoreSlot';
import { OIM_MAX_COMMANDS_PER_SLOT } from '../../engine/bucket/commands/constants/OIM_MAX_COMMANDS_PER_SLOT';
import { oimIsRevisionAfter } from '../../engine/channel/utils/oimIsRevisionAfter';
import { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import { OIMChannelService } from '../../engine/channel/OIMChannelService';

export class OIMBucketCommands implements IOIMBucketCommands {
    private readonly maxCommandsPerSlot: number;

    public constructor(options: TOIMBucketCommandsOptions) {
        this.maxCommandsPerSlot = options.maxCommandsPerSlot ?? OIM_MAX_COMMANDS_PER_SLOT;
    }

    public recordInsert(bucketSlot: TOIMBucketSlot<unknown>, index: number, bucketMemberSlot: TOIMSlot, bucketMemberSlotCount: number): void {
        this.recordCommand(bucketSlot, { type: 'insert', index, slot: bucketMemberSlot }, bucketMemberSlotCount);
    }

    public recordRemove(bucketSlot: TOIMBucketSlot<unknown>, index: number, count: number, bucketMemberSlotCount: number): void {
        for (let i = 0; i < count; i++) this.recordCommand(bucketSlot, { type: 'remove', index }, bucketMemberSlotCount);
    }

    public recordMove(bucketSlot: TOIMBucketSlot<unknown>, from: number, to: number, bucketMemberSlotCount: number): void {
        this.recordCommand(bucketSlot, { type: 'move', from, to }, bucketMemberSlotCount);
    }

    public recordWholeList(bucketSlot: TOIMBucketSlot<unknown>): void {
        const bucketSlotEditable = enlistInFlush(bucketSlot);
        const commands = bucketSlotEditable.commands as TOIMOrderedListCommand[] | undefined;
        if (commands !== undefined && commands.length !== 0) commands.length = 0;
        bucketSlotEditable.isWholeListRecorded = true;
    }

    private recordCommand(bucketSlot: TOIMBucketSlot<unknown>, orderedListCommand: TOIMOrderedListCommand, bucketMemberSlotCount: number): void {
        const bucketSlotEditable = enlistInFlush(bucketSlot);
        if (bucketSlotEditable.isWholeListRecorded) return;
        const commands = (bucketSlotEditable.commands ??= []) as TOIMOrderedListCommand[];
        commands.push(orderedListCommand);
        if (commands.length > this.maxCommandsPerSlot * bucketMemberSlotCount) {
            commands.length = 0;
            bucketSlotEditable.isWholeListRecorded = true;
        }
    }
}

function enlistInFlush(bucketSlot: TOIMBucketSlot<unknown>): TOIMSlotEditable<TOIMBucketSlot<unknown>> {
    const bucketSlotEditable = bucketSlot as TOIMSlotEditable<TOIMBucketSlot<unknown>>;
    const storeSlot = bucketSlot.storeSlot as TOIMSlotEditable<TOIMStoreSlot>;
    const channelSlot = storeSlot.channelSlot;
    const commands = bucketSlotEditable.commands;
    const hasScript = (commands !== undefined && commands.length > 0) || bucketSlotEditable.isWholeListRecorded;
    if (hasScript && !isScriptStale(channelSlot, bucketSlotEditable)) return bucketSlotEditable;
    if (hasScript) {
        clearScript(bucketSlotEditable);
    } else {
        const commandsBucketSlotChannelQueue = (storeSlot.commandsBucketSlotChannelQueue ??= new OIMChannelQueue<TOIMSlot>());
        if (commandsBucketSlotChannelQueue.getEntryCount() === 0) getCommandsStoreSlotChannelQueue(channelSlot).enqueueEntry(storeSlot);
        commandsBucketSlotChannelQueue.enqueueEntry(bucketSlotEditable);
    }
    const clock = channelSlot.clock;
    bucketSlotEditable.commandsStartedAtRevision = clock.revision;
    bucketSlotEditable.commandsStartedAtEpoch = clock.epoch;
    return bucketSlotEditable;
}

function getCommandsStoreSlotChannelQueue(channelSlot: TOIMChannelSlot): OIMChannelQueue<TOIMStoreSlot> {
    const commandsStoreSlotChannelQueue = channelSlot.commandsStoreSlotChannelQueue;
    if (commandsStoreSlotChannelQueue !== undefined) return commandsStoreSlotChannelQueue;
    const createdCommandsStoreSlotChannelQueue = new OIMChannelQueue<TOIMStoreSlot>();
    channelSlot.commandsStoreSlotChannelQueue = createdCommandsStoreSlotChannelQueue;
    OIMChannelService.INSTANCE.subscribeAfterEachFlush(channelSlot, () => {
        clearStaleScripts(channelSlot, createdCommandsStoreSlotChannelQueue);
    });
    return createdCommandsStoreSlotChannelQueue;
}

function isScriptStale(channelSlot: TOIMChannelSlot, bucketSlot: TOIMBucketSlot<unknown>): boolean {
    const frame = channelSlot.frame;
    return oimIsRevisionAfter(
        frame.openedAtRevision, frame.openedAtEpoch, bucketSlot.commandsStartedAtRevision, bucketSlot.commandsStartedAtEpoch,
    );
}

function clearScript(bucketSlotEditable: TOIMSlotEditable<TOIMBucketSlot<unknown>>): void {
    const commands = bucketSlotEditable.commands as TOIMOrderedListCommand[] | undefined;
    if (commands !== undefined && commands.length !== 0) commands.length = 0;
    bucketSlotEditable.isWholeListRecorded = false;
}

function clearStaleScripts(channelSlot: TOIMChannelSlot, commandsStoreSlotChannelQueue: OIMChannelQueue<TOIMStoreSlot>): void {
    let keptStoreSlotCount = 0;
    for (let i = 0; i < commandsStoreSlotChannelQueue.getEntryCount(); i++) {
        const storeSlot = commandsStoreSlotChannelQueue.getEntryAt(i);
        const commandsBucketSlotChannelQueue = storeSlot.commandsBucketSlotChannelQueue as OIMChannelQueue<TOIMSlot>;
        let keptBucketSlotCount = 0;
        for (let j = 0; j < commandsBucketSlotChannelQueue.getEntryCount(); j++) {
            const bucketSlotEditable = commandsBucketSlotChannelQueue.getEntryAt(j) as TOIMSlotEditable<TOIMBucketSlot<unknown>>;
            if (!isScriptStale(channelSlot, bucketSlotEditable)) {
                commandsBucketSlotChannelQueue.setEntryAt(keptBucketSlotCount++, bucketSlotEditable);
                continue;
            }
            clearScript(bucketSlotEditable);
        }
        commandsBucketSlotChannelQueue.keepFirstEntries(keptBucketSlotCount);
        if (keptBucketSlotCount !== 0) commandsStoreSlotChannelQueue.setEntryAt(keptStoreSlotCount++, storeSlot);
    }
    commandsStoreSlotChannelQueue.keepFirstEntries(keptStoreSlotCount);
}
