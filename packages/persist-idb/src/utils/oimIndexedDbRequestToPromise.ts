export function oimIndexedDbRequestToPromise<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
    return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
