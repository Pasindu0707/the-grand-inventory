/** Visual tone token applied to the status chip (color / density). */
export type StatusToneSetting =
    | 'draft'
    | 'pending'
    | 'processing'
    | 'approved'
    | 'completed'
    | 'cancelled'
    | 'rejected'
    | 'inactive'
    | 'info'
    | 'neutral'
    | 'contrast';

/** Alias: tone used by `StatusBadgeComponent` and status resolution. */
export type StatusTone = StatusToneSetting;

/** Resolved presentation for a raw status value. */
export interface StatusUi {
    key: string;
    label: string;
    tone: StatusTone;
    kind?: 'status' | 'meta';
}

/** Row model for settings / catalog UIs. */
export interface StatusCatalogItem {
    key: string;
    label: string;
    defaultTone: StatusTone;
    kind?: 'status' | 'meta';
}

/** Dropdown options for tone pickers (settings, admin). */
export const STATUS_TONE_OPTIONS: Array<{ label: string; value: StatusTone }> = [
    { label: 'Draft', value: 'draft' },
    { label: 'Pending', value: 'pending' },
    { label: 'Processing', value: 'processing' },
    { label: 'Approved', value: 'approved' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Info', value: 'info' },
    { label: 'Neutral', value: 'neutral' },
    { label: 'Contrast', value: 'contrast' }
];
