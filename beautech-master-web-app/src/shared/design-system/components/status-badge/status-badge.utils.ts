import type { StatusCatalogItem, StatusTone, StatusUi } from './status-badge.types';
import { normalizeStatusKey, readStoredStatusToneMappings } from './status-badge.storage';

const BUILTIN_STATUS_UI_DEFAULT_MAP: Record<string, StatusUi> = {
    // ───────────── STATUS FLOW ─────────────
    DRAFT: { key: 'DRAFT', label: 'Draft', tone: 'draft', kind: 'status' },

    NEW: { key: 'NEW', label: 'New', tone: 'info', kind: 'status' },
    OPEN: { key: 'OPEN', label: 'Open', tone: 'pending', kind: 'status' },
    PENDING: { key: 'PENDING', label: 'Pending', tone: 'pending', kind: 'status' },

    IN_PROGRESS: { key: 'IN_PROGRESS', label: 'In Progress', tone: 'processing', kind: 'status' },
    STARTED: { key: 'STARTED', label: 'Started', tone: 'processing', kind: 'status' },
    SUBMITTED: { key: 'SUBMITTED', label: 'Submitted', tone: 'info', kind: 'status' },

    APPROVED: { key: 'APPROVED', label: 'Approved', tone: 'approved', kind: 'status' },
    ACCEPTED: { key: 'ACCEPTED', label: 'Accepted', tone: 'approved', kind: 'status' },
    ACTIVE: { key: 'ACTIVE', label: 'Active', tone: 'approved', kind: 'status' },

    RELEASED: { key: 'RELEASED', label: 'Released', tone: 'completed', kind: 'status' },
    RECEIVED: { key: 'RECEIVED', label: 'Received', tone: 'completed', kind: 'status' },
    COMPLETED: { key: 'COMPLETED', label: 'Completed', tone: 'completed', kind: 'status' },
    DONE: { key: 'DONE', label: 'Done', tone: 'completed', kind: 'status' },

    CANCELLED: { key: 'CANCELLED', label: 'Cancelled', tone: 'cancelled', kind: 'status' },
    CANCELED: { key: 'CANCELLED', label: 'Cancelled', tone: 'cancelled', kind: 'status' },

    REJECTED: { key: 'REJECTED', label: 'Rejected', tone: 'rejected', kind: 'status' },
    LOST: { key: 'LOST', label: 'Lost', tone: 'rejected', kind: 'status' },

    INACTIVE: { key: 'INACTIVE', label: 'Inactive', tone: 'inactive', kind: 'status' },

    HOLD: { key: 'HOLD', label: 'On Hold', tone: 'neutral', kind: 'status' },
    ON_HOLD: { key: 'ON_HOLD', label: 'On Hold', tone: 'neutral', kind: 'status' },

    UNKNOWN: { key: 'UNKNOWN', label: 'Unknown', tone: 'neutral', kind: 'status' },

    // ───────────── META TYPES ─────────────
    OEM: { key: 'OEM', label: 'OEM', tone: 'approved', kind: 'meta' },
    GENUINE: { key: 'GENUINE', label: 'Genuine', tone: 'approved', kind: 'meta' },

    AFTERMARKET: { key: 'AFTERMARKET', label: 'Aftermarket', tone: 'pending', kind: 'meta' },

    SPARE_PARTS: { key: 'SPARE_PARTS', label: 'Spare Parts', tone: 'processing', kind: 'meta' },
    LABOR: { key: 'LABOR', label: 'Labor', tone: 'processing', kind: 'meta' },

    GENERAL_ITEMS: { key: 'GENERAL_ITEMS', label: 'General Items', tone: 'neutral', kind: 'meta' },
    NOT_APPLICABLE: { key: 'NOT_APPLICABLE', label: 'Not Applicable', tone: 'neutral', kind: 'meta' },

    BRAND_NEW: { key: 'BRAND_NEW', label: 'Brand New', tone: 'contrast', kind: 'meta' }
};

let statusUiDefaultMap: Record<string, StatusUi> = { ...BUILTIN_STATUS_UI_DEFAULT_MAP };

const STATUS_ALIASES: Record<string, string> = {
    UNDER_REVIEW: 'PENDING',
    TO_DO: 'PENDING',
    TODO: 'PENDING',
    PROCESSING: 'IN_PROGRESS',
    WORKING: 'IN_PROGRESS',
    FINISHED: 'COMPLETED',
    SUCCESS: 'COMPLETED',
    FAIL: 'REJECTED',
    FAILED: 'REJECTED',
    VOID: 'CANCELLED',
    DISABLED: 'INACTIVE',
    ENABLED: 'ACTIVE'
};

/** Normalize API / UI status input including boolean toggles. */
export function normalizeStatusInput(raw: unknown): string {
    if (raw === true) {
        return 'ACTIVE';
    }
    if (raw === false) {
        return 'INACTIVE';
    }
    return normalizeStatusKey(raw);
}

function toReadableLabel(normalized: string): string {
    if (!normalized) {
        return statusUiDefaultMap['UNKNOWN'].label;
    }
    return normalized
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function getStatusUi(status: unknown): StatusUi {
    const normalized = normalizeStatusInput(status);
    const canonical = STATUS_ALIASES[normalized] || normalized;
    const mapped = statusUiDefaultMap[canonical];
    const runtimeTones = readStoredStatusToneMappings();
    const mappedTone = runtimeTones[canonical] || (mapped?.key ? runtimeTones[mapped.key] : undefined);

    if (mapped) {
        return mappedTone ? { ...mapped, tone: mappedTone } : mapped;
    }

    if (mappedTone) {
        return {
            key: canonical || statusUiDefaultMap['UNKNOWN'].key,
            label: toReadableLabel(canonical),
            tone: mappedTone,
            kind: 'status'
        };
    }

    return {
        ...statusUiDefaultMap['UNKNOWN'],
        key: statusUiDefaultMap['UNKNOWN'].key,
        label: toReadableLabel(canonical)
    };
}

export function setStatusUiDefaults(map: Record<string, StatusUi>): void {
    if (!map || typeof map !== 'object') {
        statusUiDefaultMap = { ...BUILTIN_STATUS_UI_DEFAULT_MAP };
        return;
    }
    statusUiDefaultMap = { ...BUILTIN_STATUS_UI_DEFAULT_MAP, ...map };
}

export function getStatusCatalog(): StatusCatalogItem[] {
    return Object.values(statusUiDefaultMap)
        .filter((item) => item.key !== 'UNKNOWN')
        .map((item) => ({
            key: item.key,
            label: item.label,
            defaultTone: item.tone,
            kind: item.kind
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Normalize a raw value for settings keys (string rules only). */
export function normalizeStatusForSettings(raw: unknown): string {
    return normalizeStatusKey(raw);
}
