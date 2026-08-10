/**
 * Functional HTTP interceptor: injects JWT + tenant headers, single-flight 401
 * refresh, and a 1-attempt retry for transient GET network errors.
 * Ported from FRONTEND_DOCUMENTATION.md §4.1.
 */
import { inject } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, of } from 'rxjs';
import { catchError, switchMap, retry } from 'rxjs/operators';
import { AuthStore } from '../stores/auth.store';
import { API_BASE } from './api';

// Module-level single-flight refresh promise shared across concurrent 401s.
let refreshInFlight: Promise<string | null> | null = null;

function doRefresh(auth: AuthStore): Promise<string | null> {
    if (refreshInFlight) return refreshInFlight;
    const refreshToken = auth.refreshToken();
    if (!refreshToken) return Promise.resolve(null);

    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    })
        .then(async (res) => {
            if (!res.ok) throw new Error('refresh failed');
            const data = await res.json();
            auth.setTokens(data.accessToken, data.refreshToken);
            return data.accessToken as string;
        })
        .catch(() => null)
        .finally(() => {
            refreshInFlight = null;
        });

    return refreshInFlight;
}

export const authInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
    const auth = inject(AuthStore);
    const router = inject(Router);

    // Only decorate calls to our API base.
    const isApiCall = req.url.startsWith(API_BASE) || req.url.startsWith('/api/');
    if (!isApiCall) return next(req);

    const decorate = (request: HttpRequest<unknown>): HttpRequest<unknown> => {
        const token = auth.accessToken();
        const tenantId = auth.user()?.tenantId;
        let headers = request.headers;
        if (token) headers = headers.set('Authorization', `Bearer ${token}`);
        if (tenantId) headers = headers.set('x-tenant-id', tenantId);
        return request.clone({ headers });
    };

    const send = (handler: HttpHandlerFn, request: HttpRequest<unknown>) =>
        handler(decorate(request)).pipe(
            // 1-attempt retry for transient GET network failures (status 0).
            retry({
                count: req.method === 'GET' ? 1 : 0,
                delay: (err) => (err instanceof HttpErrorResponse && err.status === 0 ? of(0) : throwError(() => err))
            })
        );

    return send(next, req).pipe(
        catchError((err: HttpErrorResponse) => {
            if (err.status !== 401 || req.url.includes('/auth/refresh') || req.url.includes('/auth/login')) {
                return throwError(() => err);
            }
            return new Observable<HttpEvent<unknown>>((subscriber) => {
                doRefresh(auth).then((newToken) => {
                    if (!newToken) {
                        auth.clearSession();
                        router.navigate(['/login']);
                        subscriber.error(err);
                        return;
                    }
                    send(next, req).subscribe({
                        next: (ev) => subscriber.next(ev),
                        error: (e) => subscriber.error(e),
                        complete: () => subscriber.complete()
                    });
                });
            });
        })
    );
};
