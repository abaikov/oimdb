import type { IOIMBucketCommands } from './commands/interfaces/IOIMBucketCommands';
import type { TOIMBucketCommandsOptions } from './types/TOIMBucketCommandsOptions';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import type { TOIMOrderedListCommand } from './commands/types/TOIMOrderedListCommand';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import { OIM_MAX_COMMANDS_PER_SLOT } from './commands/constants/OIM_MAX_COMMANDS_PER_SLOT';
import { oimIsRevisionAfter } from '../channel/utils/oimIsRevisionAfter';
import { OIMChannelQueue } from '../channel/OIMChannelQueue';
import { OIMChannelService } from '../channel/OIMChannelService';

export class OIMBucketCommands implements IOIMBucketCommands {
    private readonly maxCommandsPerSlot: number;

    public constructor(options: TOIMBucketCommandsOptions) {
        this.maxCommandsPerSlot = options.maxCommandsPerSlot ?? OIM_MAX_COMMANDS_PER_SLOT;
    }

    public recordInsert(bucketSlot: TOIMBucketContentSlot<unknown>, index: number, bucketMemberSlot: TOIMSlot, bucketMemberSlotCount: number): void {
        this.recordCommand(bucketSlot, { type: 'insert', index, slot: bucketMemberSlot }, bucketMemberSlotCount);
    }

    public recordRemove(bucketSlot: TOIMBucketContentSlot<unknown>, index: number, count: number, bucketMemberSlotCount: number): void {
        for (let i = 0; i < count; i++) this.recordCommand(bucketSlot, { type: 'remove', index }, bucketMemberSlotCount);
    }

    public recordMove(bucketSlot: TOIMBucketContentSlot<unknown>, from: number, to: number, bucketMemberSlotCount: number): void {
        this.recordCommand(bucketSlot, { type: 'move', from, to }, bucketMemberSlotCount);
    }

    public recordWholeList(bucketSlot: TOIMBucketContentSlot<unknown>): void {
        const editableBucketSlot = enlistInFlush(bucketSlot);
        const commands = editableBucketSlot.commands as TOIMOrderedListCommand[] | undefined;
        if (commands !== undefined && commands.length !== 0) commands.length = 0;
        editableBucketSlot.isWholeListRecorded = true;
    }

    private recordCommand(bucketSlot: TOIMBucketContentSlot<unknown>, orderedListCommand: TOIMOrderedListCommand, bucketMemberSlotCount: number): void {
        const editableBucketSlot = enlistInFlush(bucketSlot);
        if (editableBucketSlot.isWholeListRecorded) return;
        const commands = (editableBucketSlot.commands ??= []) as TOIMOrderedListCommand[];
        commands.push(orderedListCommand);
        if (commands.length > this.maxCommandsPerSlot * bucketMemberSlotCount) {
            commands.length = 0;
            editableBucketSlot.isWholeListRecorded = true;
        }
    }
}

function enlistInFlush(bucketSlot: TOIMBucketContentSlot<unknown>): TOIMEditable<TOIMBucketContentSlot<unknown>> {
    const editableBucketSlot = bucketSlot as TOIMEditable<TOIMBucketContentSlot<unknown>>;
    const storeSlot = bucketSlot.storeSlot as TOIMEditable<TOIMStoreSlot>;
    const channelSlot = storeSlot.channelSlot;
    const commands = editableBucketSlot.commands;
    const hasScript = (commands !== undefined && commands.length > 0) || editableBucketSlot.isWholeListRecorded;
    if (hasScript && !isScriptStale(channelSlot, editableBucketSlot)) return editableBucketSlot;
    if (hasScript) {
        clearScript(editableBucketSlot);
    } else {
        const commandsBucketSlotChannelQueue = (storeSlot.commandsBucketSlotChannelQueue ??= new OIMChannelQueue<TOIMSlot>());
        if (commandsBucketSlotChannelQueue.getEntryCount() === 0) getCommandsStoreSlotChannelQueue(channelSlot).enqueueEntry(storeSlot);
        commandsBucketSlotChannelQueue.enqueueEntry(editableBucketSlot);
    }
    const clock = channelSlot.clock;
    editableBucketSlot.commandsStartedAtRevision = clock.revision;
    editableBucketSlot.commandsStartedAtEpoch = clock.epoch;
    return editableBucketSlot;
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

function isScriptStale(channelSlot: TOIMChannelSlot, bucketSlot: TOIMBucketContentSlot<unknown>): boolean {
    const frame = channelSlot.frame;
    return oimIsRevisionAfter(
        frame.openedAtRevision, frame.openedAtEpoch, bucketSlot.commandsStartedAtRevision, bucketSlot.commandsStartedAtEpoch,
    );
}

function clearScript(editableBucketSlot: TOIMEditable<TOIMBucketContentSlot<unknown>>): void {
    const commands = editableBucketSlot.commands as TOIMOrderedListCommand[] | undefined;
    if (commands !== undefined && commands.length !== 0) commands.length = 0;
    editableBucketSlot.isWholeListRecorded = false;
}

function clearStaleScripts(channelSlot: TOIMChannelSlot, commandsStoreSlotChannelQueue: OIMChannelQueue<TOIMStoreSlot>): void {
    let keptStoreSlotCount = 0;
    for (let i = 0; i < commandsStoreSlotChannelQueue.getEntryCount(); i++) {
        const storeSlot = commandsStoreSlotChannelQueue.getEntryAt(i);
        const commandsBucketSlotChannelQueue = storeSlot.commandsBucketSlotChannelQueue as OIMChannelQueue<TOIMSlot>;
        let keptBucketSlotCount = 0;
        for (let j = 0; j < commandsBucketSlotChannelQueue.getEntryCount(); j++) {
            const editableBucketSlot = commandsBucketSlotChannelQueue.getEntryAt(j) as TOIMEditable<TOIMBucketContentSlot<unknown>>;
            if (!isScriptStale(channelSlot, editableBucketSlot)) {
                commandsBucketSlotChannelQueue.setEntryAt(keptBucketSlotCount++, editableBucketSlot);
                continue;
            }
            clearScript(editableBucketSlot);
        }
        commandsBucketSlotChannelQueue.keepFirstEntries(keptBucketSlotCount);
        if (keptBucketSlotCount !== 0) commandsStoreSlotChannelQueue.setEntryAt(keptStoreSlotCount++, storeSlot);
    }
    commandsStoreSlotChannelQueue.keepFirstEntries(keptStoreSlotCount);
}
