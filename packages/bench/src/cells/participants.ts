import {
    ADAPTERS,
    ANCHOR_INDEXED,
    ANCHOR_LEAN,
    CONTROL_HEAVY,
    CONTROL_LEAN,
    CONTROL_WRITE,
    FLOOR_ADAPTER,
    adapterByName,
} from '../harness/registry';
import { isStoreless } from '../harness/scenarios';
import { wiringFor } from '../harness/types';
import type { TAdapter, TScenario } from '../harness/types';

export const participantsOf = (scenario: TScenario): readonly TAdapter[] =>
    isStoreless(scenario) ? [FLOOR_ADAPTER] : ADAPTERS;

export const declineOf = (adapter: TAdapter, scenario: TScenario): string | undefined => {
    const wiring = wiringFor(adapter, scenario);
    return wiring.build === undefined ? wiring.absent : undefined;
};

export const takesPart = (adapter: TAdapter, scenario: TScenario): boolean =>
    declineOf(adapter, scenario) === undefined;

export const eligibleOf = (scenario: TScenario): readonly TAdapter[] =>
    participantsOf(scenario).filter(adapter => takesPart(adapter, scenario));

export const controlsFor = (scenario: TScenario): readonly string[] => {
    if (isStoreless(scenario)) return [];
    const coarse = [adapterByName(CONTROL_LEAN), adapterByName(CONTROL_HEAVY)];
    if (!coarse.every(control => takesPart(control, scenario))) return [];
    const fine = adapterByName(CONTROL_WRITE);
    return [...coarse, ...(takesPart(fine, scenario) ? [fine] : [])].map(control => control.name);
};

export const anchorFor = (scenario: TScenario): string | undefined => {
    if (isStoreless(scenario)) return undefined;
    if (takesPart(ANCHOR_INDEXED, scenario)) return ANCHOR_INDEXED.name;
    return takesPart(ANCHOR_LEAN, scenario) ? ANCHOR_LEAN.name : undefined;
};
