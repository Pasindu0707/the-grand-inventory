/** Employees + shifts (FRONTEND_DOCUMENTATION.md §2.3 Employees). */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeesService, EmployeeInput } from '../services/employees.service';
import { LocationsService } from '../services/locations.service';
import { AuthStore } from '../stores/auth.store';
import { formatMoney } from '../core/money';
import { NotifyService } from '../core/notify.service';
import { apiErrorMessage } from '../core/api';
import type { AuthBranch, Employee, Role, Shift } from '../core/types';

@Component({
    selector: 'pos-employees',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="flex flex-col gap-4">
            <!-- Clock in/out -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 class="font-bold">My shift</h2>
                    <p class="text-sm text-muted-color">{{ auth.user()?.fullName }} · {{ auth.user()?.role }}</p>
                </div>
                <div class="flex gap-2">
                    <button type="button" class="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm" (click)="clockIn()">Clock in</button>
                    <button type="button" class="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm" (click)="clockOut()">Clock out</button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <!-- Staff -->
                <div class="lg:col-span-2 rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                    <h3 class="font-bold mb-3">Staff</h3>
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Name</th><th>Email</th><th>Role</th><th>Branch</th></tr></thead>
                        <tbody>
                            <tr *ngFor="let e of employees()" class="border-b border-surface/50">
                                <td class="py-2 font-medium">{{ e.fullName }}</td>
                                <td>{{ e.email }}</td>
                                <td>
                                    <select *ngIf="isOwner" [ngModel]="e.role" (ngModelChange)="changeRole(e, $event)" class="px-2 py-1 rounded border border-surface bg-surface-0 dark:bg-surface-900 text-xs">
                                        <option value="OWNER">OWNER</option><option value="MANAGER">MANAGER</option><option value="CASHIER">CASHIER</option></select>
                                    <span *ngIf="!isOwner" class="text-[11px] px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700">{{ e.role }}</span>
                                </td>
                                <td>{{ e.branchName || '—' }}</td>
                            </tr>
                            <tr *ngIf="!employees().length"><td colspan="4" class="text-center text-muted-color py-6">No staff</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Add employee -->
                <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4">
                    <h3 class="font-bold mb-3">Add employee</h3>
                    <form (ngSubmit)="create()" class="flex flex-col gap-3">
                        <input required [(ngModel)]="form.fullName" name="fullName" placeholder="Full name" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                        <input required type="email" [(ngModel)]="form.email" name="email" placeholder="Email" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                        <input required minlength="8" type="password" [(ngModel)]="form.password" name="password" placeholder="Password" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm" />
                        <select [(ngModel)]="form.role" name="role" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm"><option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option><option value="OWNER">Owner</option></select>
                        <select [(ngModel)]="form.branchId" name="branch" class="px-3 py-2 rounded-lg border border-surface bg-surface-0 dark:bg-surface-900 text-sm"><option [ngValue]="null">No branch</option><option *ngFor="let b of branches()" [ngValue]="b.id">{{ b.name }}</option></select>
                        <button type="submit" class="py-2 rounded-lg bg-primary text-primary-contrast text-sm" [disabled]="busy()">Add</button>
                    </form>
                </div>
            </div>

            <!-- Shifts -->
            <div class="rounded-2xl border border-surface bg-surface-0 dark:bg-surface-900 p-4 overflow-auto">
                <h3 class="font-bold mb-3">Shift history</h3>
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-muted-color border-b border-surface"><th class="py-2">Employee</th><th>Clock in</th><th>Clock out</th><th class="text-right">Sales</th><th class="text-right">Txns</th></tr></thead>
                    <tbody>
                        <tr *ngFor="let s of shifts()" class="border-b border-surface/50">
                            <td class="py-2">{{ s.employeeName }}</td>
                            <td>{{ s.clockIn | date: 'short' }}</td>
                            <td>{{ s.clockOut ? (s.clockOut | date: 'short') : '—' }}</td>
                            <td class="text-right">{{ money(s.salesTotal || 0) }}</td>
                            <td class="text-right">{{ s.transactionCount || 0 }}</td>
                        </tr>
                        <tr *ngIf="!shifts().length"><td colspan="5" class="text-center text-muted-color py-6">No shifts</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `
})
export class EmployeesComponent implements OnInit {
    private service = inject(EmployeesService);
    private locations = inject(LocationsService);
    auth = inject(AuthStore);
    private notify = inject(NotifyService);

    employees = signal<Employee[]>([]);
    branches = signal<AuthBranch[]>([]);
    shifts = signal<Shift[]>([]);
    busy = signal(false);
    form: EmployeeInput = { fullName: '', email: '', password: '', role: 'CASHIER', branchId: null };

    money = (n: number) => formatMoney(n);
    get isOwner(): boolean {
        return this.auth.role() === 'OWNER';
    }

    ngOnInit(): void {
        this.load();
    }

    async load(): Promise<void> {
        try {
            const [emps, brs, shf] = await Promise.all([
                this.service.listEmployees(),
                this.locations.listLocations().catch(() => []),
                this.service.listShifts().catch(() => [])
            ]);
            this.employees.set(emps ?? []);
            this.branches.set(brs ?? []);
            this.shifts.set(shf ?? []);
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async clockIn(): Promise<void> {
        try {
            await this.service.clockIn();
            this.notify.success('Clocked in');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async clockOut(): Promise<void> {
        try {
            await this.service.clockOut();
            this.notify.success('Clocked out');
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        }
    }

    async changeRole(e: Employee, role: Role): Promise<void> {
        try {
            await this.service.updateEmployee(e.id, { role });
            this.notify.success(`${e.fullName} is now ${role}`);
            this.load();
        } catch (err) {
            this.notify.error(apiErrorMessage(err));
        }
    }

    async create(): Promise<void> {
        this.busy.set(true);
        try {
            await this.service.createEmployee(this.form);
            this.notify.success('Employee added');
            this.form = { fullName: '', email: '', password: '', role: 'CASHIER', branchId: null };
            this.load();
        } catch (e) {
            this.notify.error(apiErrorMessage(e));
        } finally {
            this.busy.set(false);
        }
    }
}
