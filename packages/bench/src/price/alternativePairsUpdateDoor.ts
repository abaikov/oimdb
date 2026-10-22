import {
    OIMChannelService,
    OIMDB,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
} from '../../../core/src/index';
import type { IOIMEntityWriter, TOIMColumnSlot, TOIMEntitySlot, TOIMStoreKey } from '../../../core/src/index';
import { OIM_SLOT_FLAG_RELEASED } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_RELEASED';
import { oimGetChannelSlot } from '../../../core/src/engine/slot/utils/oimGetChannelSlot';
import type { TOIMEntitySlotOwnerService } from '../../../core/src/engine/entity/types/TOIMEntitySlotOwnerService';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceLoadedCollection } from './priceFixture';
import type { TPriceEntityService } from './priceFixture';
import { priceRoundSide } from './priceRoundSide';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TDoorSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;
type TDoorSlotContentService = TPriceEntityService<TPriceDataRow>['slotContentService'];

const probeWriter = createOIMEntityWriterInPlace();

type TDoorInternals = {
    slotOwnerService: TOIMEntitySlotOwnerService<TPriceDataRow, TOIMStoreKey, unknown, string>;
    isOnFastPath(entitySlot: TDoorSlot): boolean;
    entityWriter: IOIMEntityWriter;
};

class UpdateDoorProbe {
    private readonly doorInternals: TDoorInternals;

    private readonly slotOwnerService: TDoorInternals['slotOwnerService'];

    private readonly entityWriter: IOIMEntityWriter;

    public constructor(public readonly slotContentService: TDoorSlotContentService) {
        this.doorInternals = slotContentService as unknown as TDoorInternals;
        this.slotOwnerService = this.doorInternals.slotOwnerService;
        this.entityWriter = this.doorInternals.entityWriter;
    }

    public updateOneChannel(entitySlot: TDoorSlot, patch: Partial<TPriceDataRow>): void {
        const slotOwnerService = this.slotOwnerService;
        slotOwnerService.assertWritable(entitySlot);
        if (!this.doorInternals.isOnFastPath(entitySlot)) throw new Error('column readers');
        if (!this.entityWriter.patchEntity(entitySlot, patch, undefined)) return;
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(entitySlot), entitySlot);
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    public updateOneChannelUnreleased(entitySlot: TDoorSlot, patch: Partial<TPriceDataRow>): void {
        const slotOwnerService = this.slotOwnerService;
        slotOwnerService.assertWritable(entitySlot);
        if (!this.doorInternals.isOnFastPath(entitySlot)) throw new Error('column readers');
        if (!this.entityWriter.patchEntity(entitySlot, patch, undefined)) return;
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(entitySlot), entitySlot);
    }

    public updateOneChannelThroughModuleWriter(entitySlot: TDoorSlot, patch: Partial<TPriceDataRow>): void {
        const slotOwnerService = this.slotOwnerService;
        slotOwnerService.assertWritable(entitySlot);
        if (!this.doorInternals.isOnFastPath(entitySlot)) throw new Error('column readers');
        if (!probeWriter.patchEntity(entitySlot, patch, undefined)) return;
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(entitySlot), entitySlot);
    }

    public updateOneChannelUnasserted(entitySlot: TDoorSlot, patch: Partial<TPriceDataRow>): void {
        const slotOwnerService = this.slotOwnerService;
        if (!this.doorInternals.isOnFastPath(entitySlot)) throw new Error('column readers');
        if (!this.entityWriter.patchEntity(entitySlot, patch, undefined)) return;
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(entitySlot), entitySlot);
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }
}

type TDoorWrite = (updateDoorProbe: UpdateDoorProbe, slot: TDoorSlot, patch: Partial<TPriceDataRow>) => void;

const doorSide = (write: TDoorWrite): TPriceSide => {
    const db = new OIMDB();
    const entityService: TPriceEntityService<TPriceDataRow> = createOIMEntityService<TPriceDataRow>(db, {
        keyOf: entity => entity.id,
        entityWriter: probeWriter,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const updateDoorProbe = new UpdateDoorProbe(entityService.slotContentService);
    const fixture = priceLoadedCollection(db, entityService, entityService.createStoreSlot(db), priceDataset.makeRows(priceDataset.batch));
    const patch: { title: string } = { title: '' };
    return priceRoundSide(fixture.slots.length, (upTo, round) => {
        const slots = fixture.slots;
        patch.title = priceDataset.titles[round & 7];
        for (let i = 0; i < upTo; i++) write(updateDoorProbe, slots[i], patch);
    }, () => fixture.db.flush());
};

const shippedDoor: TDoorWrite = (updateDoorProbe, slot, patch) => { updateDoorProbe.slotContentService.updateEntity(slot, patch); };
const oneChannelDoor: TDoorWrite = (updateDoorProbe, slot, patch) => { updateDoorProbe.updateOneChannel(slot, patch); };
const unreleasedDoor: TDoorWrite = (updateDoorProbe, slot, patch) => { updateDoorProbe.updateOneChannelUnreleased(slot, patch); };
const unassertedDoor: TDoorWrite = (updateDoorProbe, slot, patch) => { updateDoorProbe.updateOneChannelUnasserted(slot, patch); };
const moduleWriterDoor: TDoorWrite = (updateDoorProbe, slot, patch) => { updateDoorProbe.updateOneChannelThroughModuleWriter(slot, patch); };
const functionDoor: TDoorWrite = (_updateDoorProbe, slot, patch) => {
    const channelSlot = oimGetChannelSlot(slot);
    OIMChannelService.INSTANCE.assertNotFlushing(channelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
    if (slot.columnSlotStore !== undefined) throw new Error('column readers');
    if (!probeWriter.patchEntity(slot, patch, undefined)) return;
    OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot);
};

const DOOR =
    'Both sides run over the same createOIMEntityService population of priceDataset.batch entities, '
    + 'one { title } patch per round and one flush per round; no index and no subscriber, so every write is one channel write. '
    + 'The probe methods reach the content service\'s private slotOwnerService, isOnFastPath and entityWriter through a cast (`as unknown as {…}`), the same pieces updateEntity runs on; only the shape of the door differs.';

const doorPair = (step: string, ours: TDoorWrite, oursText: string, floor: TDoorWrite, floorText: string, isolates: string): TPricePair => ({
    id: `alt.update-door.${step}`,
    path: EPricePath.PerWrite,
    ours: oursText,
    floor: floorText,
    caveat: `${DOOR} This pair isolates: ${isolates}`,
    build: () => ({ ours: doorSide(ours), floor: doorSide(floor) }),
});

export const alternativePairsUpdateDoor: readonly TPricePair[] = [
    doorPair('shipped-vs-one-channel-method', shippedDoor, 'entityService.slotContentService.updateEntity(slot, patch) — the shipped door',
        oneChannelDoor, 'a probe method doing only the one-channel path: assert, column-reader check, writer, channel, release',
        'the shipped OIMSlotContentEntityService.updateEntity against one probe method, and releaseWrittenSlotIfUnheld — a no-op under the default AtEmpty policy — on the shipped side against the full releaseSlotIfUnheld the method runs; both sides read isOnFastPath.'),
    doorPair('release-check', oneChannelDoor, 'the one-channel method with releaseSlotIfUnheld',
        unreleasedDoor, 'the same method without releaseSlotIfUnheld',
        'a full releaseSlotIfUnheld after a landed write, which the shipped updateEntity does not run by default: it calls releaseWrittenSlotIfUnheld, a no-op unless the release policy releases written slots.'),
    doorPair('write-asserts', oneChannelDoor, 'the one-channel method with assertWritable',
        unassertedDoor, 'the same method without assertWritable',
        'assertWritable: the flush guard and the released check.'),
    doorPair('writer-field-vs-module-writer', unreleasedDoor, 'the one-channel method without release, writer read from the content service\'s entityWriter',
        moduleWriterDoor, 'the same method, the same writer object read from a module constant',
        'reading the writer off the probe field instead of a module constant.'),
    doorPair('method-vs-function', moduleWriterDoor, 'the one-channel method through the module writer, as a method on the probe',
        functionDoor, 'the same steps as a plain function over the public members: assertNotFlushing, isReleased, columnSlotStore, the writer, the channel',
        'running the steps as a method on the probe, through the private pieces reached by the cast — assertWritable and isOnFastPath as calls — instead of inlining assertNotFlushing, isReleased and a columnSlotStore read over public members.'),
];
