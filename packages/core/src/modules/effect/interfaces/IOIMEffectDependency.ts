export interface IOIMEffectDependency {
    subscribe(onUpdate: () => void): () => void;
}


