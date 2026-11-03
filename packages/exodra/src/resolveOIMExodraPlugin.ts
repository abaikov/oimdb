import type { TExoContextToken } from '@exodra/context';
import type { OIMExodraPlugin } from './OIMExodraPlugin';
import { OIM_EXODRA_PLUGIN_CONTEXT_TOKEN } from './OIM_EXODRA_PLUGIN_CONTEXT_TOKEN';

type TOIMExodraPluginCarrier = {
    inject<TValue>(key: TExoContextToken<TValue>): TValue | undefined;
    readonly exodraPlugin?: OIMExodraPlugin | undefined;
};

export function resolveOIMExodraPlugin(c: TOIMExodraPluginCarrier): OIMExodraPlugin {
    const exodraPlugin = c.inject(OIM_EXODRA_PLUGIN_CONTEXT_TOKEN) ?? c.exodraPlugin;
    if (exodraPlugin === undefined) {
        throw new Error(
            'No OIMExodraPlugin for this node: compose `{ exodraPlugin: () => new OIMExodraPlugin({ db }) }` into the backend, '
            + 'or provide one under OIM_EXODRA_PLUGIN_CONTEXT_TOKEN above it.',
        );
    }
    return exodraPlugin;
}
