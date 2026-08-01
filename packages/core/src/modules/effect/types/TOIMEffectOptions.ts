import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';

export type TOIMEffectOptions = {
    deps?: readonly IOIMEffectDependency[];
    onUpdate?: () => void;
    run: () => void;
    /**
     * Subscribe immediately. Default `true`. Pass `false` to build the node now
     * and start listening later — what a selector with no watchers wants.
     */
    startActive?: boolean;
};


