import { OIMDB, OIMEffectService, createOIMSingleComputedService } from '@oimdb/core';
import {
    createOIMBrowserFocusSingleSlotService,
    createOIMBrowserLocationSingleSlotService,
    createOIMBrowserOnlineSingleSlotService,
    createOIMBrowserVisibilitySingleSlotService,
} from '../src';

const effectService = OIMEffectService.INSTANCE;

const setOnline = (isOnline: boolean): void => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => isOnline });
};

const setVisibilityState = (visibilityState: DocumentVisibilityState): void => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilityState });
};

afterEach(() => {
    setOnline(true);
    setVisibilityState('visible');
    jest.restoreAllMocks();
    delete (globalThis as { navigation?: EventTarget }).navigation;
});

describe('what a browser slot hears', () => {
    it('writes the current value when the slot gets its first subscriber, and a change after an event', () => {
        const db = new OIMDB();
        const onlineService = createOIMBrowserOnlineSingleSlotService();
        const online = onlineService.createStoreSlot(db);
        const onlineSlot = onlineService.getSingleSlot(online);
        const seen: boolean[] = [];
        const effect = effectService.createEffect(db, () => { seen.push(onlineSlot.entity?.isOnline ?? true); }, [onlineSlot]);

        expect(onlineSlot.entity).toEqual({ isOnline: true });
        setOnline(false);
        window.dispatchEvent(new Event('offline'));
        db.flush();

        expect(seen).toEqual([false]);
        effectService.disposeEffect(effect);
    });

    it('does not wake an effect for an event that leaves the value as it was', () => {
        const db = new OIMDB();
        const onlineService = createOIMBrowserOnlineSingleSlotService();
        const online = onlineService.createStoreSlot(db);
        const onlineSlot = onlineService.getSingleSlot(online);
        let runs = 0;
        const effect = effectService.createEffect(db, () => { runs++; }, [onlineSlot]);
        db.flush();
        const runsAfterTheFirstValue = runs;

        window.dispatchEvent(new Event('online'));
        db.flush();

        expect(runs).toBe(runsAfterTheFirstValue);
        effectService.disposeEffect(effect);
    });

    it('takes its browser listener off when the last subscriber goes', () => {
        const db = new OIMDB();
        const removeEventListener = jest.spyOn(window, 'removeEventListener');
        const onlineService = createOIMBrowserOnlineSingleSlotService();
        const online = onlineService.createStoreSlot(db);
        const onlineSlot = onlineService.holdSingleSlot(online);
        const effect = effectService.createEffect(db, () => undefined, [onlineSlot]);

        effectService.disposeEffect(effect);
        setOnline(false);
        window.dispatchEvent(new Event('offline'));

        expect(removeEventListener.mock.calls.map(([eventName]) => eventName).sort()).toEqual(['offline', 'online']);
        expect(onlineSlot.entity).toEqual({ isOnline: true });
        onlineSlot.owner.unholdSlot(onlineSlot);
    });

    it('writes the first value after the flush when the subscription arrives inside one', () => {
        const db = new OIMDB();
        const onlineService = createOIMBrowserOnlineSingleSlotService();
        const online = onlineService.createStoreSlot(db);
        const triggerService = createOIMBrowserVisibilitySingleSlotService();
        const trigger = triggerService.createStoreSlot(db);
        const triggerSlot = triggerService.getSingleSlot(trigger);
        let onlineSlot: ReturnType<typeof onlineService.getSingleSlot> | undefined;
        const outer = effectService.createEffect(db, () => {
            if (onlineSlot !== undefined) return;
            onlineSlot = onlineService.getSingleSlot(online);
            effectService.createEffect(db, () => undefined, [onlineSlot]);
        }, [triggerSlot]);
        setVisibilityState('hidden');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(() => { db.flush(); }).not.toThrow();
        expect(onlineSlot?.entity).toEqual({ isOnline: true });
        effectService.disposeEffect(outer);
    });

    it('is heard through a computed that reads it, by an effect subscribed only to the computed', () => {
        const db = new OIMDB();
        const onlineService = createOIMBrowserOnlineSingleSlotService();
        const online = onlineService.createStoreSlot(db);
        const onlineSlot = onlineService.holdSingleSlot(online);
        const isOfflineService = createOIMSingleComputedService<boolean>();
        const isOffline = isOfflineService.createComputedStoreSlot(
            db, () => onlineSlot.entity?.isOnline === false, () => ({ sourceSlots: [onlineSlot] }),
        );
        const isOfflineSlot = isOfflineService.computedSingleSlotService.getSingleSlot(isOffline);
        const seen: boolean[] = [];
        const effect = effectService.createEffect(db, () => {
            seen.push(isOfflineSlot.value);
        }, [], [isOfflineSlot]);
        db.flush();

        setOnline(false);
        window.dispatchEvent(new Event('offline'));
        db.flush();

        expect(seen).toEqual([false, true]);
        effectService.disposeEffect(effect);
        onlineSlot.owner.unholdSlot(onlineSlot);
    });

    it('reads focus from document.hasFocus, not from the event that fired', () => {
        const db = new OIMDB();
        const hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
        const focusService = createOIMBrowserFocusSingleSlotService();
        const focus = focusService.createStoreSlot(db);
        const focusSlot = focusService.getSingleSlot(focus);
        const effect = effectService.createEffect(db, () => undefined, [focusSlot]);

        window.dispatchEvent(new Event('blur'));
        expect(focusSlot.entity).toEqual({ isFocused: true });

        hasFocus.mockReturnValue(false);
        window.dispatchEvent(new Event('blur'));
        expect(focusSlot.entity).toEqual({ isFocused: false });
        effectService.disposeEffect(effect);
    });

    it('follows document visibility', () => {
        const db = new OIMDB();
        const visibilityService = createOIMBrowserVisibilitySingleSlotService();
        const visibility = visibilityService.createStoreSlot(db);
        const visibilitySlot = visibilityService.getSingleSlot(visibility);
        const effect = effectService.createEffect(db, () => undefined, [visibilitySlot]);

        setVisibilityState('hidden');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(visibilitySlot.entity).toEqual({ isVisible: false });
        effectService.disposeEffect(effect);
    });

    it('follows the location through popstate and hashchange when there is no Navigation API', () => {
        const db = new OIMDB();
        const locationService = createOIMBrowserLocationSingleSlotService();
        const location = locationService.createStoreSlot(db);
        const locationSlot = locationService.getSingleSlot(location);
        const effect = effectService.createEffect(db, () => undefined, [locationSlot]);

        window.history.pushState({}, '', '/cards?deck=spades');
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(locationSlot.entity).toMatchObject({ pathname: '/cards', search: '?deck=spades', hash: '' });

        window.location.hash = '#ace';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        expect(locationSlot.entity).toMatchObject({ pathname: '/cards', hash: '#ace' });
        effectService.disposeEffect(effect);
    });

    it('hears a router push through the Navigation API when the browser has one', () => {
        const navigation = new EventTarget();
        (globalThis as { navigation?: EventTarget }).navigation = navigation;
        const db = new OIMDB();
        const locationService = createOIMBrowserLocationSingleSlotService();
        const location = locationService.createStoreSlot(db);
        const locationSlot = locationService.getSingleSlot(location);
        const effect = effectService.createEffect(db, () => undefined, [locationSlot]);

        window.history.pushState({}, '', '/decks');
        navigation.dispatchEvent(new Event('currententrychange'));

        expect(locationSlot.entity).toMatchObject({ pathname: '/decks' });
        effectService.disposeEffect(effect);
    });

    it('holds true for a browser that reports no onLine and no hasFocus', () => {
        const db = new OIMDB();
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => undefined });
        const hasFocus = Object.getOwnPropertyDescriptor(Document.prototype, 'hasFocus');
        Object.defineProperty(document, 'hasFocus', { configurable: true, value: undefined });
        const onlineService = createOIMBrowserOnlineSingleSlotService();
        const onlineSlot = onlineService.getSingleSlot(onlineService.createStoreSlot(db));
        const focusService = createOIMBrowserFocusSingleSlotService();
        const focusSlot = focusService.getSingleSlot(focusService.createStoreSlot(db));
        const effect = effectService.createEffect(db, () => undefined, [onlineSlot, focusSlot]);

        expect([onlineSlot.entity, focusSlot.entity]).toEqual([{ isOnline: true }, { isFocused: true }]);
        effectService.disposeEffect(effect);
        delete (document as { hasFocus?: unknown }).hasFocus;
        expect(hasFocus).toBeDefined();
    });
});
