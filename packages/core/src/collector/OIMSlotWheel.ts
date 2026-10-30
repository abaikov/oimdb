import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMTimer } from '../schedule/types/TOIMTimer';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import type { TOIMFlushSchedulerSlot } from '../schedule/types/TOIMFlushSchedulerSlot';
import type { IOIMErrorPolicy } from '../error/interfaces/IOIMErrorPolicy';
import type { TOIMSlotWheelOptions } from './types/TOIMSlotWheelOptions';
import { OIMFlushSchedulerService } from '../schedule/OIMFlushSchedulerService';
import type { IOIMFlushSchedulerListener } from '../schedule/interfaces/IOIMFlushSchedulerListener';
import { oimSliceOfMs } from './utils/oimSliceOfMs';
import { OIM_SLICE_LENGTH_MS } from './constants/OIM_SLICE_LENGTH_MS';

export abstract class OIMSlotWheel implements TOIMFlushSchedulerSlot, IOIMFlushSchedulerListener<OIMSlotWheel> {
    public readonly timer: TOIMTimer;

    public scheduledCallback: (() => void) | undefined = undefined;

    public timerDisposer: TOIMDisposer | undefined = undefined;

    public readonly getNowMs: () => number;

    private readonly errorPolicy: IOIMErrorPolicy;

    private scheduledUntilMs = Number.POSITIVE_INFINITY;

    private readonly slotsBySliceNumber = new Map<number, TOIMSlot[]>();

    private lastFiledSliceNumber = Number.NaN;

    private lastFiledSliceSlots: TOIMSlot[] | undefined = undefined;

    private floorSliceNumber = Number.NEGATIVE_INFINITY;

    private nextSliceNumber: number | undefined = undefined;

    private nextSliceNumberNeedsRescan = false;

    public constructor(options: TOIMSlotWheelOptions) {
        this.timer = options.timer;
        this.getNowMs = options.getNowMs;
        this.errorPolicy = options.errorPolicy;
    }

    public getNextSliceNumber(): number | undefined {
        if (this.nextSliceNumberNeedsRescan) {
            let nextSliceNumber: number | undefined;
            for (const sliceNumber of this.slotsBySliceNumber.keys()) {
                if (nextSliceNumber === undefined || sliceNumber < nextSliceNumber) nextSliceNumber = sliceNumber;
            }
            this.nextSliceNumber = nextSliceNumber;
            this.nextSliceNumberNeedsRescan = false;
        }
        return this.nextSliceNumber;
    }

    public sweepUpToSliceNumber(upToSliceNumber: number): void {
        const nextSliceNumber = this.getNextSliceNumber();
        if (nextSliceNumber === undefined || nextSliceNumber > upToSliceNumber) return;
        const outerFloor = this.floorSliceNumber;
        this.floorSliceNumber = upToSliceNumber + 1;
        const slotsBySliceNumber = this.slotsBySliceNumber;
        try {
            if (upToSliceNumber - nextSliceNumber < slotsBySliceNumber.size) {
                for (let sliceNumber = nextSliceNumber; sliceNumber <= upToSliceNumber; sliceNumber++) {
                    const sliceSlots = slotsBySliceNumber.get(sliceNumber);
                    if (sliceSlots !== undefined) this.sweepSlice(sliceNumber, sliceSlots);
                }
            } else {
                for (const [sliceNumber, sliceSlots] of slotsBySliceNumber) {
                    if (sliceNumber <= upToSliceNumber) this.sweepSlice(sliceNumber, sliceSlots);
                }
            }
        } finally {
            this.floorSliceNumber = outerFloor;
        }
        this.onSweepFinished();
    }

    public flush(): void {
        this.cancelSlotWheelSchedule();
        try {
            this.sweepUpToSliceNumber(this.getSweptSliceNumberAt(this.getNowMs()));
        } finally {
            this.scheduleNextSweep();
        }
    }

    public cancelAllSlots(): void {
        this.cancelSlotWheelSchedule();
        for (const sliceSlots of this.slotsBySliceNumber.values()) {
            for (let index = 0; index < sliceSlots.length; index++) this.onSlotDropped(sliceSlots[index]);
        }
        this.slotsBySliceNumber.clear();
        this.lastFiledSliceSlots = undefined;
        this.nextSliceNumber = undefined;
        this.nextSliceNumberNeedsRescan = false;
    }

    protected fileSlot(sliceNumber: number, slot: TOIMSlot): void {
        const flooredSliceNumber = Math.max(sliceNumber, this.floorSliceNumber);
        let sliceSlots = flooredSliceNumber === this.lastFiledSliceNumber ? this.lastFiledSliceSlots : undefined;
        if (sliceSlots === undefined) {
            sliceSlots = this.slotsBySliceNumber.get(flooredSliceNumber);
            if (sliceSlots === undefined) { sliceSlots = []; this.slotsBySliceNumber.set(flooredSliceNumber, sliceSlots); }
            this.lastFiledSliceNumber = flooredSliceNumber;
            this.lastFiledSliceSlots = sliceSlots;
        }
        sliceSlots.push(slot);
        this.lowerNextSliceNumber(flooredSliceNumber);
    }

    protected scheduleNextSweep(): void {
        const nextSliceNumber = this.getNextSliceNumber();
        if (nextSliceNumber === undefined) return;
        const nowMs = this.getNowMs();
        const untilMs = Math.max(nowMs, (nextSliceNumber + 1) * OIM_SLICE_LENGTH_MS);
        if (OIMFlushSchedulerService.INSTANCE.isScheduled(this)) {
            if (untilMs >= this.scheduledUntilMs) return;
            this.cancelSlotWheelSchedule();
        }
        this.scheduledUntilMs = untilMs;
        OIMFlushSchedulerService.INSTANCE.schedule(this, untilMs - nowMs, this);
    }

    private cancelSlotWheelSchedule(): void {
        this.scheduledUntilMs = Number.POSITIVE_INFINITY;
        OIMFlushSchedulerService.INSTANCE.cancelSchedule(this);
    }

    public onSchedulerTimerFired(): void {
        try {
            this.flush();
        } catch (error) {
            this.errorPolicy.onErrorCaught(error);
        }
    }

    protected getSweptSliceNumberAt(nowMs: number): number {
        return oimSliceOfMs(nowMs);
    }

    protected abstract onSlotDue(slot: TOIMSlot, nowMs: number): void;

    protected onSlotDropped(_slot: TOIMSlot): void { return; }

    protected onSweepFinished(): void { return; }

    private lowerNextSliceNumber(sliceNumber: number): void {
        const nextSliceNumber = this.nextSliceNumber;
        if (nextSliceNumber === undefined || sliceNumber <= nextSliceNumber) {
            this.nextSliceNumber = sliceNumber;
            this.nextSliceNumberNeedsRescan = false;
        }
    }

    private sweepSlice(sliceNumber: number, sliceSlots: TOIMSlot[]): void {
        this.slotsBySliceNumber.delete(sliceNumber);
        if (this.lastFiledSliceSlots === sliceSlots) this.lastFiledSliceSlots = undefined;
        if (sliceNumber === this.nextSliceNumber) this.nextSliceNumberNeedsRescan = true;
        const nowMs = this.getNowMs();
        let index = 0;
        try {
            for (; index < sliceSlots.length; index++) this.onSlotDue(sliceSlots[index], nowMs);
        } finally {
            if (index < sliceSlots.length - 1) {
                this.slotsBySliceNumber.set(sliceNumber, sliceSlots.slice(index + 1));
                this.lowerNextSliceNumber(sliceNumber);
            }
        }
    }
}
