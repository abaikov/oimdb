import type { TAdapter } from './types';

export type TParticipantModule = {
    name: string;
    file: string;
    exportName: string;
};

export const PARTICIPANT_MODULES: readonly TParticipantModule[] = [
    { name: 'baseline-array', file: 'adapters/baseline-array.ts', exportName: 'baselineArrayAdapter' },
    { name: 'baseline-indexed', file: 'adapters/baseline-array-indexed.ts', exportName: 'baselineArrayIndexedAdapter' },
    { name: 'oimdb', file: 'adapters/oimdb.ts', exportName: 'oimdbAdapter' },
    { name: 'oimdb-sorted-index', file: 'adapters/oimdb.ts', exportName: 'oimdbSortedIndexAdapter' },
    { name: 'oimdb-3.12.1', file: 'adapters/oimdb-legacy.ts', exportName: 'oimdbLegacyAdapter' },
    { name: 'tinybase', file: 'adapters/tinybase.ts', exportName: 'tinybaseAdapter' },
    { name: 'signaldb', file: 'adapters/signaldb.ts', exportName: 'signaldbAdapter' },
    { name: 'tanstack-db', file: 'adapters/tanstack-db.ts', exportName: 'tanstackDbAdapter' },
    { name: 'tanstack-db-eager', file: 'adapters/tanstack-db.ts', exportName: 'tanstackDbEagerAdapter' },
    { name: 'tanstack-db-indexed', file: 'adapters/tanstack-db.ts', exportName: 'tanstackDbIndexedAdapter' },
    { name: 'lokijs', file: 'adapters/lokijs.ts', exportName: 'lokiAdapter' },
    { name: 'mobx', file: 'adapters/mobx.ts', exportName: 'mobxAdapter' },
    { name: 'jotai', file: 'adapters/jotai.ts', exportName: 'jotaiAdapter' },
    { name: 'legend-state', file: 'adapters/legend-state.ts', exportName: 'legendStateAdapter' },
    { name: 'effector', file: 'adapters/effector.ts', exportName: 'effectorAdapter' },
    { name: 'nanostores', file: 'adapters/nanostores.ts', exportName: 'nanostoresAdapter' },
    { name: 'nanostores-per-row', file: 'adapters/nanostores.ts', exportName: 'nanostoresPerRowAdapter' },
    { name: 'redux-toolkit', file: 'adapters/redux-toolkit.ts', exportName: 'reduxToolkitAdapter' },
    { name: 'preact-signals', file: 'adapters/preact-signals.ts', exportName: 'preactSignalsAdapter' },
    { name: 'alien-signals', file: 'adapters/alien-signals.ts', exportName: 'alienSignalsAdapter' },
    { name: 'zustand', file: 'adapters/zustand.ts', exportName: 'zustandAdapter' },
    { name: 'valtio', file: 'adapters/valtio.ts', exportName: 'valtioAdapter' },
    { name: 'xstate-store', file: 'adapters/xstate-store.ts', exportName: 'xstateStoreAdapter' },
    { name: 'vue-reactivity', file: 'adapters/vue-reactivity.ts', exportName: 'vueReactivityAdapter' },
    { name: 'solid-js', file: 'adapters/solid-signals.ts', exportName: 'solidSignalsAdapter' },
    { name: 'tanstack-store', file: 'adapters/tanstack-store.ts', exportName: 'tanstackStoreAdapter' },
    { name: 'control-lean', file: 'harness/control.ts', exportName: 'controlLeanAdapter' },
    { name: 'control-heavy', file: 'harness/control.ts', exportName: 'controlHeavyAdapter' },
    { name: 'control-write', file: 'harness/control.ts', exportName: 'controlWriteAdapter' },
];

export const participantModuleOf = (name: string): TParticipantModule => {
    const found = PARTICIPANT_MODULES.find(participantModule => participantModule.name === name);
    if (found === undefined) {
        throw new Error(
            `Unknown participant "${name}". Known: ${PARTICIPANT_MODULES.map(m => m.name).join(', ')}`
        );
    }
    return found;
};

export const loadParticipant = async (name: string): Promise<TAdapter> => {
    const participantModule = participantModuleOf(name);
    const moduleUrl = new URL(`../${participantModule.file}`, import.meta.url).href;
    const loaded = (await import(moduleUrl)) as Record<string, unknown>;
    const adapter = loaded[participantModule.exportName] as TAdapter | undefined;
    if (adapter === undefined || adapter.name !== name) {
        throw new Error(
            `${participantModule.file} does not export "${participantModule.exportName}" as the ` +
                `participant named "${name}"`
        );
    }
    return adapter;
};
