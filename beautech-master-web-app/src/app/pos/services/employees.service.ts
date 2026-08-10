/** Employees service + shifts (FRONTEND_DOCUMENTATION.md §7.1). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';
import { AuthStore } from '../stores/auth.store';
import type { AuthBranch, Employee, Role, Shift } from '../core/types';

export interface EmployeeInput {
    fullName: string;
    email: string;
    password?: string;
    role: Role;
    branchId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class EmployeesService {
    private http = inject(HttpClient);
    private auth = inject(AuthStore);

    async switchMyBranch(branchId: string): Promise<AuthBranch> {
        const branch = await firstValueFrom(
            this.http.post<AuthBranch>(`${API_BASE}/employees/me/branch`, { branchId })
        );
        this.auth.setBranch(branch);
        return branch;
    }

    listEmployees(): Promise<Employee[]> {
        return firstValueFrom(this.http.get<Employee[]>(`${API_BASE}/employees`));
    }

    createEmployee(data: EmployeeInput): Promise<Employee> {
        return firstValueFrom(this.http.post<Employee>(`${API_BASE}/employees`, data));
    }

    updateEmployee(id: string, data: Partial<EmployeeInput>): Promise<Employee> {
        return firstValueFrom(this.http.put<Employee>(`${API_BASE}/employees/${id}`, data));
    }

    clockIn(): Promise<Shift> {
        return firstValueFrom(this.http.post<Shift>(`${API_BASE}/employees/me/clock-in`, {}));
    }

    clockOut(): Promise<Shift> {
        return firstValueFrom(this.http.post<Shift>(`${API_BASE}/employees/me/clock-out`, {}));
    }

    listShifts(params: Record<string, string> = {}): Promise<Shift[]> {
        return firstValueFrom(this.http.get<Shift[]>(`${API_BASE}/shifts`, { params }));
    }
}
