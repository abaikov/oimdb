import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';

type Profile = { name: string; city: string; age: number };

/** A scheduler that runs the frame the moment it is asked for. */
const rightNow = (run: () => void): void => { run(); };

const effectService = OIMEffectService.INSTANCE;

const createFixture =() => {
    const db = new OIMDB({ channelScheduler: rightNow });
    const profileService = createOIMSingleEntityService<Profile>(db);
    const profile = profileService.createStoreSlot(db);
    profileService.slotContentService.upsertEntity(profile, { name: 'ann', city: 'lisbon', age: 30 });
    return { db, profileService, profile };
};

describe('a standalone record does not tear in half', () => {
    it('marks the record before any frame a column write asks for can run', () => {
        const { db, profileService, profile } = createFixture();
        const seen: string[] = [];
        effectService.createEffect(db, [profileService.getColumn(profileService.getSingleSlot(profile), 'city')], [], () => { seen.push('column'); });
        effectService.createEffect(db, [profileService.getSingleSlot(profile)], [], () => { seen.push('record'); });
        seen.length = 0;

        profileService.slotContentService.updateEntity(profileService.getSingleSlot(profile), { city: 'porto' });

        // Both, and in one frame. Torn, the column body runs on a frame the
        // record never entered, and the record body is not called at all.
        expect(seen).toContain('column');
        expect(seen).toContain('record');
    });

    it('runs one frame for one update, however many columns it touched', () => {
        const { db, profileService, profile } = createFixture();
        let frames = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { frames++; });
        effectService.createEffect(db, [profileService.getColumn(profileService.getSingleSlot(profile), 'city')], [], () => undefined);
        effectService.createEffect(db, [profileService.getColumn(profileService.getSingleSlot(profile), 'age')], [], () => undefined);
        frames = 0;

        profileService.slotContentService.updateEntity(profileService.getSingleSlot(profile), { city: 'porto', age: 31 });

        expect(frames).toBe(1);
    });

    it('does the same for a removal, which takes the other door', () => {
        const { db, profileService, profile } = createFixture();
        const seen: string[] = [];
        effectService.createEffect(db, [profileService.getColumn(profileService.getSingleSlot(profile), 'city')], [], () => { seen.push('column'); });
        effectService.createEffect(db, [profileService.getSingleSlot(profile)], [], () => { seen.push('record'); });
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
        effectService.createEffect(db, [profileService.getSingleSlot(profile)], [], () => undefined);
        frames = 0;

        profileService.slotContentService.updateEntity(profileService.getSingleSlot(profile), { city: 'lisbon' });

        // The span must not turn a write that changed nothing into a frame.
        expect(frames).toBe(0);
    });
});
