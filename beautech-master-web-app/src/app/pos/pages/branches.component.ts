/** Branches/locations CRUD (FRONTEND_DOCUMENTATION.md §2.3 Branches). */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationsService, LocationInput } from '../services/locations.service';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { AuthBranch } from '../core/types';

@Component({
    selector: 'pos-branches',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Name</th><th>Type</th><th>Address</th><th class="text-right">Actions</th></tr></thead>
                    <tbody>
                        <tr *ngFor="let l of locations()" class="border-b border-surface/50">
                            <td class="py-2 font-medium">{{ l.name }}</td>
                            <td><span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700">{{ l.type }}</span></td>
                            <td>{{ l.address || '—' }}</td>
                            <td class="text-right whitespace-nowrap"><button type="button" class="text-primary text-xs mr-3" (click)="edit(l)">Edit</button><button type="button" class="text-rose-500 text-xs" (click)="remove(l)">Delete</button></td>
                        </tr>
                        <tr *ngIf="!locations().length"><td colspan="4" class="text-center text-muted-color py-6">No locations</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                <h3 class="font-bold mb-3">{{ editingId ? 'Edit' : 'New' }} location</h3>
                <form (ngSubmit)="save()" class="flex flex-col gap-3">
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Name</span><input required [(ngModel)]="form.name" name="name" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Type</span><select [(ngModel)]="form.type" name="type" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900"><option value="BRANCH">Branch</option><option value="WAREHOUSE">Warehouse</option></select></label>
                    <label class="flex flex-col gap-1 text-sm"><span class="text-xs uppercase tracking-wider text-muted-color">Address</span><input [(ngModel)]="form.address" name="address" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900" /></label>
                    <div class="flex gap-2">
                        <button type="submit" class="flex-1 py-2 rounded-lg bg-primary text-primary-contrast text-sm" [disabled]="busy()">Save</button>
                        <button type="button" *ngIf="editingId" class="px-4 py-2 rounded-lg border border-surface text-sm" (click)="reset()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `
})
export class BranchesComponent implements OnInit {
    private service = inject(LocationsService);
    private notify = inject(NotifyService);

    locations = signal<AuthBranch[]>([]);
    editingId: string | null = null;
    busy = signal(false);
    form: LocationInput = { name: '', type: 'BRANCH', address: '' };

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        try {
            this.locations.set(await this.service.listLocations());
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    edit(l: AuthBranch): void {
        this.editingId = l.id;
        this.form = { name: l.name, type: l.type, address: l.address ?? '' };
    }

    reset(): void {
        this.editingId = null;
        this.form = { name: '', type: 'BRANCH', address: '' };
    }

    async save(): Promise<void> {
        this.busy.set(true);
        try {
            if (this.editingId) await this.service.updateLocation(this.editingId, this.form);
            else await this.service.createLocation(this.form);
            this.notify.success('Location saved');
            this.reset();
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }

    async remove(l: AuthBranch): Promise<void> {
        if (!(await this.notify.confirm(`Delete ${l.name}?`, 'Delete location'))) return;
        try {
            await this.service.deleteLocation(l.id);
            this.notify.success('Location deleted');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }
}
