/**
 * Status badge design-system surface: types, storage, resolution utils,
 * optional JSON defaults loader, and the PrimeNG Tag-based chip component.
 */
export type { StatusCatalogItem, StatusTone, StatusToneSetting, StatusUi } from './status-badge.types';
export { STATUS_TONE_OPTIONS } from './status-badge.types';
export {
    clearStoredStatusToneMappings,
    normalizeStatusKey,
    readStoredStatusToneMappings,
    STATUS_COLOR_MAPPINGS_STORAGE_KEY,
    writeStoredStatusToneMappings
} from './status-badge.storage';
export {
    getStatusCatalog,
    getStatusUi,
    normalizeStatusForSettings,
    normalizeStatusInput,
    setStatusUiDefaults
} from './status-badge.utils';
export { StatusUiConfigService, initializeStatusUiDefaultsFactory } from './status-badge-config.service';
export { StatusBadgeComponent } from './status-badge.component';
