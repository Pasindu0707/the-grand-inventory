/**
 * Tailwind icon-well colors: SaaS / ClickUp-style flat accents + semantic aliases.
 * Class strings use `!` so sidebar layout CSS variables do not override wells.
 * Keep every literal here — Tailwind JIT scans this file.
 * Slim docked pane: leaves + accordion icons use `menuNavAccentClasses` + `*--chroma` squircle layout in `_sidebar_slim.scss`.
 */

export type MenuNavAccentKey =
    | 'brand'
    | 'info'
    | 'success'
    | 'warning'
    | 'danger'
    | 'neutral'
    | 'slate'
    | 'zinc'
    | 'red'
    | 'orange'
    | 'amber'
    | 'yellow'
    | 'lime'
    | 'green'
    | 'emerald'
    | 'teal'
    | 'cyan'
    | 'sky'
    | 'blue'
    | 'indigo'
    | 'violet'
    | 'purple'
    | 'fuchsia'
    | 'pink'
    | 'rose'
    | 'stone';

/** Semantic keys — align with tailwind.config.js extended palette where applicable. */
export const MENU_NAV_ACCENT_CLASSES: Record<MenuNavAccentKey, readonly [string, string]> = {
    brand: ['!bg-indigo-600', '!text-white'],
    info: ['!bg-blue-600', '!text-white'],
    success: ['!bg-emerald-600', '!text-white'],
    warning: ['!bg-amber-600', '!text-white'],
    danger: ['!bg-rose-600', '!text-white'],
    neutral: ['!bg-zinc-600', '!text-white'],

    slate: ['!bg-slate-500', '!text-white'],
    zinc: ['!bg-zinc-600', '!text-white'],
    red: ['!bg-red-500', '!text-white'],
    orange: ['!bg-orange-500', '!text-white'],
    amber: ['!bg-amber-500', '!text-white'],
    yellow: ['!bg-yellow-400', '!text-zinc-900'],
    lime: ['!bg-lime-500', '!text-zinc-900'],
    green: ['!bg-green-500', '!text-white'],
    emerald: ['!bg-emerald-500', '!text-white'],
    teal: ['!bg-teal-600', '!text-white'],
    cyan: ['!bg-cyan-500', '!text-white'],
    sky: ['!bg-sky-500', '!text-white'],
    blue: ['!bg-blue-500', '!text-white'],
    indigo: ['!bg-indigo-500', '!text-white'],
    violet: ['!bg-violet-600', '!text-white'],
    purple: ['!bg-purple-500', '!text-white'],
    fuchsia: ['!bg-fuchsia-600', '!text-white'],
    pink: ['!bg-pink-500', '!text-white'],
    rose: ['!bg-rose-500', '!text-white'],
    stone: ['!bg-stone-500', '!text-white']
};

/**
 * Light icon wells for sidebar / flyout submenu (inactive leaves) — matches saturated keys above.
 * Tailwind JIT must see these literals (do not build class names dynamically).
 */
export const MENU_NAV_ACCENT_SOFT_ICON_CLASSES: Record<MenuNavAccentKey, readonly [string, string]> = {
    brand: ['!bg-indigo-100', '!text-indigo-700'],
    info: ['!bg-blue-100', '!text-blue-700'],
    success: ['!bg-emerald-100', '!text-emerald-700'],
    warning: ['!bg-amber-100', '!text-amber-800'],
    danger: ['!bg-rose-100', '!text-rose-700'],
    neutral: ['!bg-zinc-100', '!text-zinc-700'],

    slate: ['!bg-slate-100', '!text-slate-700'],
    zinc: ['!bg-zinc-100', '!text-zinc-700'],
    red: ['!bg-red-100', '!text-red-700'],
    orange: ['!bg-orange-100', '!text-orange-800'],
    amber: ['!bg-amber-100', '!text-amber-800'],
    yellow: ['!bg-yellow-100', '!text-yellow-800'],
    lime: ['!bg-lime-100', '!text-lime-800'],
    green: ['!bg-green-100', '!text-green-800'],
    emerald: ['!bg-emerald-100', '!text-emerald-700'],
    teal: ['!bg-teal-100', '!text-teal-800'],
    cyan: ['!bg-cyan-100', '!text-cyan-800'],
    sky: ['!bg-sky-100', '!text-sky-800'],
    blue: ['!bg-blue-100', '!text-blue-700'],
    indigo: ['!bg-indigo-100', '!text-indigo-700'],
    violet: ['!bg-violet-100', '!text-violet-800'],
    purple: ['!bg-purple-100', '!text-purple-800'],
    fuchsia: ['!bg-fuchsia-100', '!text-fuchsia-800'],
    pink: ['!bg-pink-100', '!text-pink-800'],
    rose: ['!bg-rose-100', '!text-rose-700'],
    stone: ['!bg-stone-100', '!text-stone-700']
};

export const DEFAULT_MENU_NAV_ACCENT_KEY: MenuNavAccentKey = 'neutral';

/**
 * Parent row: submenu open from click, but no child page is active yet — one neutral “selected” tone
 * (distinct from strong `navAccent` when a leaf route is active).
 */
export const MENU_PARENT_SIMPLE_SELECTED: readonly [string, string] = ['!bg-zinc-200', '!text-zinc-800'];

export function menuParentSimpleSelectedClasses(): string[] {
    return [...MENU_PARENT_SIMPLE_SELECTED];
}

/**
 * Cycle order for auto-assigned leaf accents (ClickUp-style variety).
 * Used sequentially in menu DFS order so neighbors get different hues (not hash collisions).
 */
export const MENU_NAV_ACCENT_CLICKUP_CYCLE: readonly MenuNavAccentKey[] = [
    'red',
    'orange',
    'amber',
    'yellow',
    'lime',
    'green',
    'emerald',
    'teal',
    'cyan',
    'sky',
    'blue',
    'indigo',
    'violet',
    'purple',
    'fuchsia',
    'pink',
    'rose',
    'stone',
    'slate'
];

/** @deprecated use MENU_NAV_ACCENT_CLICKUP_CYCLE */
export const MENU_NAV_ACCENT_FALLBACK_ORDER = MENU_NAV_ACCENT_CLICKUP_CYCLE;

export function isMenuNavAccentKey(v: unknown): v is MenuNavAccentKey {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MENU_NAV_ACCENT_CLASSES, v);
}

export function menuNavAccentClasses(key: MenuNavAccentKey): string[] {
    const pair = MENU_NAV_ACCENT_CLASSES[key];
    return pair ? [...pair] : [...MENU_NAV_ACCENT_CLASSES[DEFAULT_MENU_NAV_ACCENT_KEY]];
}

export function menuNavAccentSoftIconClasses(key: MenuNavAccentKey): string[] {
    const pair = MENU_NAV_ACCENT_SOFT_ICON_CLASSES[key];
    return pair ? [...pair] : [...MENU_NAV_ACCENT_SOFT_ICON_CLASSES[DEFAULT_MENU_NAV_ACCENT_KEY]];
}

/** Resolve accent key when `navAccent` is missing (aligns with `applyLeafNavAccentCycle` index for same seed). */
export function menuNavAccentKeyForHash(seed: string): MenuNavAccentKey {
    let h = 0;
    for (let k = 0; k < seed.length; k++) {
        h = (h * 31 + seed.charCodeAt(k)) | 0;
    }
    const idx = Math.abs(h) % MENU_NAV_ACCENT_CLICKUP_CYCLE.length;
    return MENU_NAV_ACCENT_CLICKUP_CYCLE[idx]!;
}

/** Fallback when `navAccent` is missing (should be rare after `applyLeafNavAccentCycle`). */
export function menuNavAccentClassesForHash(seed: string): string[] {
    return menuNavAccentClasses(menuNavAccentKeyForHash(seed));
}

/**
 * Deep-clones the filtered menu tree and assigns `navAccent` on every **leaf** (has `routerLink`, no `items`)
 * that does not already have a valid `navAccent`. Walk order matches `flattenMenuToCommands` (DFS, sibling order).
 * Section rows keep their own `navAccent` (e.g. brand on Operations); only leaves get cycle colors.
 */
export function applyLeafNavAccentCycle(items: any[]): any[] {
    let serial = 0;
    const L = MENU_NAV_ACCENT_CLICKUP_CYCLE.length;

    const walk = (nodes: any[]): any[] =>
        (nodes || []).map((item) => {
            if (item.visible === false) {
                return { ...item };
            }
            const out: any = { ...item };
            const hasChildren = Array.isArray(item.items) && item.items.length > 0;
            if (hasChildren) {
                out.items = walk(item.items);
            } else if (Array.isArray(item.routerLink) && item.routerLink.length) {
                const explicit = isMenuNavAccentKey(item.navAccent);
                out.navAccent = explicit
                    ? item.navAccent
                    : MENU_NAV_ACCENT_CLICKUP_CYCLE[serial % L];
                serial++;
            }
            return out;
        });

    return walk(items);
}
