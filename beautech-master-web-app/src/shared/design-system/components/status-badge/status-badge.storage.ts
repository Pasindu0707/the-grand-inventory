import type { StatusToneSetting } from './status-badge.types';

export const STATUS_COLOR_MAPPINGS_STORAGE_KEY = 'status-color-mappings-v1';

const VALID_TONES: readonly StatusToneSetting[] = [
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
];

/** Normalize a key for storage / settings (string rules only; booleans handled in utils). */
export function normalizeStatusKey(raw: unknown): string {
    return String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
}

function isStatusTone(value: unknown): value is StatusToneSetting {
    return VALID_TONES.includes(value as StatusToneSetting);
}

export function readStoredStatusToneMappings(): Record<string, StatusToneSetting> {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(STATUS_COLOR_MAPPINGS_STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const normalized: Record<string, StatusToneSetting> = {};

        Object.entries(parsed || {}).forEach(([key, tone]) => {
            const normalizedKey = normalizeStatusKey(key);
            if (!normalizedKey || !isStatusTone(tone)) {
                return;
            }
            normalized[normalizedKey] = tone;
        });

        return normalized;
    } catch {
        return {};
    }
}

export function writeStoredStatusToneMappings(mappings: Record<string, StatusToneSetting>): void {
    if (typeof window === 'undefined') {
        return;
    }

    const cleaned: Record<string, StatusToneSetting> = {};
    Object.entries(mappings || {}).forEach(([key, tone]) => {
        const normalizedKey = normalizeStatusKey(key);
        if (!normalizedKey || !isStatusTone(tone)) {
            return;
        }
        cleaned[normalizedKey] = tone;
    });

    window.localStorage.setItem(STATUS_COLOR_MAPPINGS_STORAGE_KEY, JSON.stringify(cleaned));
}

export function clearStoredStatusToneMappings(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(STATUS_COLOR_MAPPINGS_STORAGE_KEY);
}
