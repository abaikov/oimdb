import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type Profile = { name: string; city: string; age: number };

/** A scheduler that runs the frame the moment it is asked for. */
const rightNow = (run: () => void): void => { run(); };

const effectService = OIMEffectService.INSTANCE;

const createFixture =() => {
    const db = new OIMDB({ channelScheduler: rightNow });
    const profileService = createOIMSingleSlotService({ slotContentService: createOIMSlotContentEntityService<Profile>() });
    const profile = profileService.createStoreSlot(db);
    profileService.writeSingleSlotContent(profile, { name: 'ann', city: 'lisbon', age: 30 });
    return { db, profileService, profile };
};

describe('a standalone record does not tear its value in half', () => {
    it('marks the record before any frame a column write asks for can run', () => {
        const { db, profileService, profile } = createFixture();
        const seen: string[] = [];
        effectService.createEffect(db, () => { seen.push('column'); }, [profileService.columnSlotService.getColumn(profileService.getSingleSlot(profile), 'city')]);
        effectService.createEffect(db, () => { seen.push('record'); }, [profileService.getSingleSlot(profile)]);
        seen.length = 0;

        profileService.slotContentService.updateEntity(profileService.getSingleSlot(profile), { city: 'porto' });

        // Both, and in one frame. Torn, the column body runs on a frame the
        // record never entered, and the record body is not called at all.
        expect(seen).toContain('column');
        expect(seen).toContain('record');
    });

    it('runs each effect once for one update, on the full value, however many frames the scheduler makes of it', () => {
        const { db, profileService, profile } = createFixture();
        const profileSlot = profileService.getSingleSlot(profile);
        const seen: string[] = [];
        let frames = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { frames++; });
        effectService.createEffect(db, () => {
            seen.push(`city ${profileSlot.entity?.city} ${profileSlot.entity?.age}`);
        }, [profileService.columnSlotService.getColumn(profileSlot, 'city')]);
        effectService.createEffect(db, () => {
            seen.push(`age ${profileSlot.entity?.city} ${profileSlot.entity?.age}`);
        }, [profileService.columnSlotService.getColumn(profileSlot, 'age')]);
        seen.length = 0;
        frames = 0;

        profileService.slotContentService.updateEntity(profileSlot, { city: 'porto', age: 31 });

        expect(seen).toEqual(['city porto 31', 'age porto 31']);
        expect(frames).toBe(2);
    });

    it('does the same for a removal, which takes the other door', () => {
        const { db, profileService, profile } = createFixture();
        const seen: string[] = [];
        effectService.createEffect(db, () => { seen.push('column'); }, [profileService.columnSlotService.getColumn(profileService.getSingleSlot(profile), 'city')]);
        effectService.createEffect(db, () => { seen.push('record'); }, [profileService.getSingleSlot(profile)]);
        seen.length = 0;

        profileService.slotContentService.deleteEntityColumns(profileService.getSingleSlot(profile), ['city']);

        expect(seen).toContain('column');
        expect(seen).toContain('record');
        expect(profileService.getSingleSlot(profile).entity?.city).toBeUndefined();
    });

    it('asks for no frame at all when the patch changed nothing', () => {
        const { db, profileService, profile } = createFixture();
        let frames = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { frames++; });
        effectService.createEffect(db, () => undefined, [profileService.getSingleSlot(profile)]);
        frames = 0;

        profileService.slotContentService.updateEntity(profileService.getSingleSlot(profile), { city: 'lisbon' });

        // The span must not turn a write that changed nothing into a frame.
        expect(frames).toBe(0);
    });
});
