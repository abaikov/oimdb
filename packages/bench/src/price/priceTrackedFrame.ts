import { priceSink } from './priceSink';

export type TPriceTrackedFrame = { readonly stamps: Int32Array; readonly queued: number[]; frame: number };

export const priceTrackedFrame = (count: number): TPriceTrackedFrame =>
    ({ stamps: new Int32Array(count).fill(-1), queued: [], frame: 0 });

export const priceQueueOnce = (trackedFrame: TPriceTrackedFrame, index: number): void => {
    if (trackedFrame.stamps[index] === trackedFrame.frame) return;
    trackedFrame.stamps[index] = trackedFrame.frame;
    trackedFrame.queued.push(index);
};

export const priceCloseTrackedFrame = (trackedFrame: TPriceTrackedFrame): void => {
    priceSink.number = trackedFrame.queued.length;
    trackedFrame.queued.length = 0;
    trackedFrame.frame++;
};
