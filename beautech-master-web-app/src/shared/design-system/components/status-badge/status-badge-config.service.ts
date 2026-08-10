import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { StatusTone, StatusUi } from './status-badge.types';
import { setStatusUiDefaults } from './status-badge.utils';

const STATUS_UI_DEFAULTS_URL = '/assets/config/status-ui-default-map.json';

@Injectable({ providedIn: 'root' })
export class StatusUiConfigService {
    constructor(private readonly http: HttpClient) {}

    async loadDefaultsFromJson(): Promise<void> {
        try {
            const payload = await firstValueFrom(this.http.get<Record<string, Partial<StatusUi>>>(STATUS_UI_DEFAULTS_URL));
            const normalized = this.normalizeMap(payload || {});
            setStatusUiDefaults(normalized);
        } catch {
            setStatusUiDefaults({});
        }
    }

    private normalizeMap(input: Record<string, Partial<StatusUi>>): Record<string, StatusUi> {
        const out: Record<string, StatusUi> = {};

        Object.entries(input || {}).forEach(([rawKey, value]) => {
            const key = String(rawKey || '')
                .trim()
                .toUpperCase()
                .replace(/[\s-]+/g, '_');
            if (!key) {
                return;
            }

            const tone = this.isStatusTone(value?.tone) ? value!.tone! : 'neutral';
            out[key] = {
                key,
                label: String(value?.label || this.toReadableLabel(key)),
                tone,
                kind: value?.kind === 'meta' ? 'meta' : 'status'
            };
        });

        return out;
    }

    private toReadableLabel(normalized: string): string {
        return normalized
            .toLowerCase()
            .split('_')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private isStatusTone(value: unknown): value is StatusTone {
        return [
            'draft',
            'pending',
            'processing',
            'approved',
            'completed',
            'cancelled',
            'rejected',
            'inactive',
            'info',
            'neutral',
            'contrast'
        ].includes(String(value));
    }
}

export function initializeStatusUiDefaultsFactory(config: StatusUiConfigService): () => Promise<void> {
    return () => config.loadDefaultsFromJson();
}
