import { join } from 'node:path';
import { BENCH_SRC } from '../cells/paths';
import { participantModuleOf } from '../harness/participantModules';
import { ADAPTERS } from '../harness/registry';
import type { TAdapter, TChurnShapeKey, TReadShapeKey } from '../harness/types';
import { WIRING_SHAPES, wiringCodeVolume } from './wiringCodeVolume';
import type { TShapeVolume, TWiringShape } from './wiringCodeVolume';

export type TParticipantCodeVolume = {
    participant: string;
    file: string;
    shapes: readonly TShapeVolume[];
};

const supplies = (adapter: TAdapter, shape: TWiringShape): boolean => {
    if (shape.startsWith('churn.')) return adapter.churn[shape.slice(6) as TChurnShapeKey].build !== undefined;
    if (shape.startsWith('reads.')) return adapter.reads[shape.slice(6) as TReadShapeKey].build !== undefined;
    if (shape === 'relations') return adapter.relations.build !== undefined;
    if (shape === 'single') return adapter.single.build !== undefined;
    return true;
};

export const participantCodeVolumes = (): TParticipantCodeVolume[] =>
    ADAPTERS.map(adapter => {
        const file = participantModuleOf(adapter.name).file;
        const measured = wiringCodeVolume(join(BENCH_SRC, file));
        return {
            participant: adapter.name,
            file,
            shapes: WIRING_SHAPES.flatMap(shape => {
                const volume = measured.find(entry => entry.shape === shape);
                return volume !== undefined && supplies(adapter, shape) ? [volume] : [];
            }),
        };
    });

export const codeLinesOf = (
    volumes: readonly TParticipantCodeVolume[],
    participant: string,
    shape: TWiringShape
): number | undefined =>
    volumes.find(volume => volume.participant === participant)?.shapes.find(entry => entry.shape === shape)?.codeLines;
