import { TOIMPersistUnsubscribe } from './TOIMPersistUnsubscribe';

export type TOIMPersistSourceAdapter<TSnapshot> = {
    read(): TSnapshot;
    write(snapshot: TSnapshot): void;
    subscribe(onChange: () => void): TOIMPersistUnsubscribe;
};
