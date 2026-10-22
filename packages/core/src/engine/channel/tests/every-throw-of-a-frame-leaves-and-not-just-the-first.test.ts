
import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import { OIMErrorPolicyThrowAtOnce } from '../../error/OIMErrorPolicyThrowAtOnce';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type Row = { n: number };

const makeSlot = (key: string): TOIMEntitySlot<Row, string> =>
    createOIMEntitySlot<Row, string>(key, new OIMSlotOwner());

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const channelService = OIMChannelService.INSTANCE;
const effectService = OIMEffectService.INSTANCE;

describe('every throw of a frame reaches the error policy, not just the first', () => {
    let consoleError: jest.SpyInstance;
    beforeEach(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => { consoleError.mockRestore(); });

    it('logs and hands on all three when three effect bodies throw, by default, and the flush returns', () => {
        const reported: string[] = [];
        const db = new OIMDB({
            errorPolicy: new OIMErrorPolicyLogAndContinue({ onError: error => { reported.push(messageOf(error)); } }),
        });
        const first = makeSlot('first');
        const second = makeSlot('second');
        const third = makeSlot('third');
        effectService.createEffect(db, [first], [], () => { throw new Error('the first body threw'); });
        effectService.createEffect(db, [second], [], () => { throw new Error('the second body threw'); });
        effectService.createEffect(db, [third], [], () => { throw new Error('the third body threw'); });
        channelService.write(db.defaultChannelSlot, first);
        channelService.write(db.defaultChannelSlot, second);
        channelService.write(db.defaultChannelSlot, third);

        expect(() => { db.flush(); }).not.toThrow();
        expect(reported).toEqual(['the first body threw', 'the second body threw', 'the third body threw']);
        expect(consoleError).toHaveBeenCalledTimes(3);
    });

    it('logs and goes on when no policy is named', () => {
        const db = new OIMDB();
        const slot = makeSlot('slot');
        effectService.createEffect(db, [slot], [], () => { throw new Error('the only body threw'); });
        channelService.write(db.defaultChannelSlot, slot);

        expect(() => { db.flush(); }).not.toThrow();
        expect(consoleError).toHaveBeenCalledTimes(1);
    });

    it('hears every phase of a frame, in the order they run', () => {
        const reported: string[] = [];
        const slot = makeSlot('slot');
        const db = new OIMDB({
            errorPolicy: { onErrorCaught: error => { reported.push(messageOf(error)); } },
            onBeforeFlush: () => { throw new Error('before the frame'); },
        });
        effectService.createEffect(db, [slot], [], () => { throw new Error('inside the frame'); });
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { throw new Error('after the frame'); });
        channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { throw new Error('after the flush'); });
        channelService.write(db.defaultChannelSlot, slot);

        db.flush();

        expect(reported).toEqual(['before the frame', 'inside the frame', 'after the frame', 'after the flush']);
    });

    it('still runs the next after-flush handler when one before it throws', () => {
        const db = new OIMDB({ errorPolicy: { onErrorCaught: () => undefined } });
        let laterRan = false;
        channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { throw new Error('the first handler threw'); });
        channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { laterRan = true; });

        db.flush();

        expect(laterRan).toBe(true);
    });

    it('throws the first error out of the flush at once, and keeps the effects it did not reach for the next flush', () => {
        const db = new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() });
        const first = makeSlot('first');
        const second = makeSlot('second');
        let secondRuns = 0;
        effectService.createEffect(db, [first], [], () => { throw new Error('the first body threw'); });
        effectService.createEffect(db, [second], [], () => { secondRuns++; });
        channelService.write(db.defaultChannelSlot, first);
        channelService.write(db.defaultChannelSlot, second);

        expect(() => { db.flush(); }).toThrow('the first body threw');
        expect(secondRuns).toBe(0);

        db.flush();
        expect(secondRuns).toBe(1);
    });
});
