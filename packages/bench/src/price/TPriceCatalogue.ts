import type { TPricePair } from './TPricePair';

export type TPriceCatalogue = {
    readonly controls: readonly TPricePair[];
    readonly priced: readonly TPricePair[];
    readonly alternatives: readonly TPricePair[];
    readonly catalogueOf: (id: string) => string | undefined;
};
