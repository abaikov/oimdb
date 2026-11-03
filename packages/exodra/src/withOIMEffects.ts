import { withExoEffects } from '@exodra/core';
import type { TExoBaseNodeMethods, TExoMachine } from '@exodra/core';
import { resolveOIMExodraPlugin } from './resolveOIMExodraPlugin';
import type { TOIMExodraEffect } from './types/TOIMExodraEffect';

export function withOIMEffects<
    TWiring extends TExoBaseNodeMethods, TPorts, TParams, TState,
    TMachine extends TExoMachine<TWiring, TPorts, TParams, TState>,
>(
    machine: TMachine & TExoMachine<TWiring, TPorts, TParams, TState>,
    declare: (effect: TOIMExodraEffect<TWiring & { state: TState }>) => void,
): TMachine {
    return withExoEffects(machine, (exoEffect) => {
        declare((body) => {
            exoEffect((c) => {
                const db = resolveOIMExodraPlugin(c).db;
                return db.createEffect(() => { body(c, db); });
            });
        });
    });
}
