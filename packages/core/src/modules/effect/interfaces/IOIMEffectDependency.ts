import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';

export interface IOIMEffectDependency {
    subscribe(phase: EOIMEffectPhase, onInvalidate: () => void): () => void;
}


