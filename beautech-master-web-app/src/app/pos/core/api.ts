/** API base URL + error-message extraction (FRONTEND_DOCUMENTATION.md §4.1). */
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** All POS endpoints live under this base. The template proxies/serves the API here. */
export const API_BASE = `${environment.apiUrl}/api/v1`;

export function apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
        const msg = (error.error && (error.error.message || error.error.error)) as string | undefined;
        return msg || error.message || 'Request failed';
    }
    if (error instanceof Error) return error.message;
    return 'Unexpected error';
}
