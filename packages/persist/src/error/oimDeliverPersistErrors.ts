import type { TOIMPersistErrorHandler } from './types/TOIMPersistErrorHandler';
import type { TOIMPersistErrorReport } from './types/TOIMPersistErrorReport';

export function oimDeliverPersistErrors(
    onPersistError: TOIMPersistErrorHandler | undefined,
    persistErrors: readonly TOIMPersistErrorReport[],
): void {
    if (persistErrors.length === 0) return;
    if (onPersistError !== undefined) {
        for (let i = 0; i < persistErrors.length; i++) {
            onPersistError(persistErrors[i].error, persistErrors[i].persistErrorContext);
        }
        return;
    }
    const firstError = persistErrors[0].error;
    throw new AggregateError(
        persistErrors.map(persistError => persistError.error),
        `OIMPersistor: ${persistErrors.length} resource${persistErrors.length === 1 ? '' : 's'} failed in one `
        + `${persistErrors[0].persistErrorContext.persistOperation}. First of them: `
        + `${firstError instanceof Error ? firstError.message : String(firstError)}. `
        + 'Every one of them is on `error.errors`; pass onPersistError to OIMPersistor to receive them one by one.',
    );
}
