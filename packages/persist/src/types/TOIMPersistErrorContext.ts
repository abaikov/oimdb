import { IOIMAnyPersistResource } from '../interfaces/IOIMAnyPersistResource';

export type TOIMPersistErrorContext = {
    resource: IOIMAnyPersistResource<unknown>;
    operation: 'persist' | 'hydrate';
};
