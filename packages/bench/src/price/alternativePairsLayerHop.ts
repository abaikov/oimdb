import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

const POOL = 1024;

type TLayerHopSlot = {
    holdCount: number;
    memberCount: number;
    bucketSlotsStore: unknown[];
    changedAtRevision: number;
};

class LayerHopChannel {
    private revision = 0;

    public writeWithoutFlushCheck(slot: TLayerHopSlot): void {
        slot.changedAtRevision = ++this.revision;
    }
}

class LayerHopInternalService {
    public constructor(private readonly channel: LayerHopChannel) {}

    public holdSlot(slot: TLayerHopSlot): void {
        slot.holdCount++;
    }

    public getBucketMemberSlotCount(slot: TLayerHopSlot): number {
        return slot.memberCount;
    }

    public writeBucketMember(slot: TLayerHopSlot, member: unknown): void {
        slot.bucketSlotsStore[0] = member;
        this.channel.writeWithoutFlushCheck(slot);
    }
}

class LayerHopPublicService {
    public constructor(private readonly layerHopInternalService: LayerHopInternalService) {}

    public holdSlot(slot: TLayerHopSlot): void {
        this.layerHopInternalService.holdSlot(slot);
    }

    public getBucketMemberSlotCount(slot: TLayerHopSlot): number {
        return this.layerHopInternalService.getBucketMemberSlotCount(slot);
    }

    public writeBucketMember(slot: TLayerHopSlot, member: unknown): void {
        this.layerHopInternalService.writeBucketMember(slot, member);
    }
}

const inertSide: TPriceSide = { reset: () => undefined, run: () => undefined };

const MEMBERS: readonly object[] = [{ id: 'a' }, { id: 'b' }];

const mintSlots = (): TLayerHopSlot[] => {
    const slots: TLayerHopSlot[] = [];
    for (let i = 0; i < POOL; i++) slots.push({ holdCount: 0, memberCount: i & 7, bucketSlotsStore: [undefined], changedAtRevision: 0 });
    return slots;
};

const holdThroughPublicLayer = (): TPriceSide => {
    const slots = mintSlots();
    const layerHopPublicService = new LayerHopPublicService(new LayerHopInternalService(new LayerHopChannel()));
    return {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            for (let i = 0; i < times; i++) layerHopPublicService.holdSlot(slots[i & mask]);
        },
    };
};

const holdOnInternalLayer = (): TPriceSide => {
    const slots = mintSlots();
    const layerHopInternalService = new LayerHopInternalService(new LayerHopChannel());
    return {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            for (let i = 0; i < times; i++) layerHopInternalService.holdSlot(slots[i & mask]);
        },
    };
};

const readThroughPublicLayer = (): TPriceSide => {
    const slots = mintSlots();
    const layerHopPublicService = new LayerHopPublicService(new LayerHopInternalService(new LayerHopChannel()));
    return {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            let total = 0;
            for (let i = 0; i < times; i++) total += layerHopPublicService.getBucketMemberSlotCount(slots[i & mask]);
            priceSink.number = total;
        },
    };
};

const readOnInternalLayer = (): TPriceSide => {
    const slots = mintSlots();
    const layerHopInternalService = new LayerHopInternalService(new LayerHopChannel());
    return {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            let total = 0;
            for (let i = 0; i < times; i++) total += layerHopInternalService.getBucketMemberSlotCount(slots[i & mask]);
            priceSink.number = total;
        },
    };
};

const writeThroughPublicLayer = (): TPriceSide => {
    const slots = mintSlots();
    const layerHopPublicService = new LayerHopPublicService(new LayerHopInternalService(new LayerHopChannel()));
    return {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            for (let i = 0; i < times; i++) layerHopPublicService.writeBucketMember(slots[i & mask], MEMBERS[i & 1]);
        },
    };
};

const writeOnInternalLayer = (): TPriceSide => {
    const slots = mintSlots();
    const layerHopInternalService = new LayerHopInternalService(new LayerHopChannel());
    return {
        reset: () => undefined,
        run: times => {
            const mask = POOL - 1;
            for (let i = 0; i < times; i++) layerHopInternalService.writeBucketMember(slots[i & mask], MEMBERS[i & 1]);
        },
    };
};

const LAYER_HOP_CAVEAT =
    'A self-contained model, importing nothing from core, of the public/internal split Andrey approved on 2026-10-21: '
    + 'the public service holds the internal one in a private readonly field and each door forwards to the same '
    + 'internal method. Ours goes through the public door; the floor calls the internal method directly, on the same '
    + 'pool of 1024 slots. Both arms see one receiver class each, so the only difference is the forwarding call and '
    + 'its field load. No channel assert is in either arm, so this prices the hop and nothing the real door adds. '
    + 'Each arm runs in its own process.';

export const alternativePairsLayerHop: readonly TPricePair[] = [
    {
        id: 'alt.layer-hop.hold-through-public-layer-vs-internal',
        path: EPricePath.PerRead,
        ours: 'publicService.holdSlot(slot), forwarding to internalService.holdSlot',
        floor: 'internalService.holdSlot(slot): holdCount++',
        caveat: `${LAYER_HOP_CAVEAT} The door is a hold: one increment.`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : holdThroughPublicLayer(),
            floor: wanted === 'ours' ? inertSide : holdOnInternalLayer(),
        }),
    },
    {
        id: 'alt.layer-hop.read-through-public-layer-vs-internal',
        path: EPricePath.PerRead,
        ours: 'publicService.getBucketMemberSlotCount(slot), forwarding to the internal service',
        floor: 'internalService.getBucketMemberSlotCount(slot): one field load',
        caveat: `${LAYER_HOP_CAVEAT} The door is a read: one field load, summed into a sink.`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : readThroughPublicLayer(),
            floor: wanted === 'ours' ? inertSide : readOnInternalLayer(),
        }),
    },
    {
        id: 'alt.layer-hop.write-through-public-layer-vs-internal',
        path: EPricePath.PerWrite,
        ours: 'publicService.writeBucketMember(slot, member), forwarding to the internal service',
        floor: 'internalService.writeBucketMember(slot, member): one store and one channel call',
        caveat: `${LAYER_HOP_CAVEAT} The door is a write: one array store and one channel call that stamps a revision.`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : writeThroughPublicLayer(),
            floor: wanted === 'ours' ? inertSide : writeOnInternalLayer(),
        }),
    },
];
