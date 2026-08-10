/** Bridge Dexie liveQuery → RxJS Observable for use with the async pipe. */
import { liveQuery } from 'dexie';
import { Observable, from } from 'rxjs';

export function liveQuery$<T>(querier: () => T | Promise<T>): Observable<T> {
    return from(liveQuery(querier) as unknown as Promise<T> & { subscribe: unknown }) as Observable<T>;
}
