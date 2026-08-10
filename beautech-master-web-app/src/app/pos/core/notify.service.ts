/** Thin wrapper over SweetAlert2 (confirmations) + ngx-toastr (toasts). */
import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class NotifyService {
    private toastr = inject(ToastrService);

    success(message: string, title = 'Success'): void {
        this.toastr.success(message, title);
    }

    error(message: string, title = 'Error'): void {
        this.toastr.error(message, title);
    }

    info(message: string, title = 'Info'): void {
        this.toastr.info(message, title);
    }

    warning(message: string, title = 'Warning'): void {
        this.toastr.warning(message, title);
    }

    /** Returns true if the user confirmed. */
    async confirm(message: string, title = 'Are you sure?', confirmText = 'Yes'): Promise<boolean> {
        const res = await Swal.fire({
            title,
            text: message,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#71717a'
        });
        return res.isConfirmed;
    }

    async alert(message: string, title = 'Notice', icon: 'success' | 'error' | 'info' | 'warning' = 'info'): Promise<void> {
        await Swal.fire({ title, text: message, icon, confirmButtonColor: '#2563eb' });
    }
}
