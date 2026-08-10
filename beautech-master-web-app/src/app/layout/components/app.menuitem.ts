import {
    ChangeDetectorRef,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    HostBinding,
    inject,
    Input,
    OnDestroy,
    OnInit,
    ViewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { animate, AnimationEvent, state, style, transition, trigger } from '@angular/animations';
import { merge, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DomHandler } from 'primeng/dom';
import { TooltipModule } from 'primeng/tooltip';
import { CommonModule } from '@angular/common';
import { RippleModule } from 'primeng/ripple';
import { LayoutService } from '@/layout/service/layout.service';
import { TabService } from '@/layout/components/tab-service';
import {
    DEFAULT_MENU_NAV_ACCENT_KEY,
    isMenuNavAccentKey,
    MENU_PARENT_SIMPLE_SELECTED,
    menuNavAccentClasses,
    menuNavAccentKeyForHash,
    menuParentSimpleSelectedClasses,
    type MenuNavAccentKey
} from '@/shared/navigation';

@Component({
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: '[app-menuitem]',
    imports: [CommonModule, RouterModule, RippleModule, TooltipModule],
    template: `
        <ng-container>
            <div
                *ngIf="root && item.visible !== false && shouldShowRootText() && !isRootLeaf"
                class="layout-menuitem-root-text"
                [ngClass]="rootSectionTitleAccentClasses()">
                {{ item.label }}
            </div>

            <!-- Slim docked pane depth 0: flat section + always-visible links -->
            <div
                *ngIf="dockedSubmenu && item.items?.length && item.visible !== false && dockedPaneDepth === 0"
                class="layout-pane-group">
                <div
                    class="layout-pane-section-title"
                    [class.layout-pane-section-title--active]="routeActive">
                    {{ item.label }}
                </div>
                <ul class="layout-pane-group-list">
                    <ng-container *ngFor="let child of item.items; let i = index">
                        <li
                            app-menuitem
                            [item]="child"
                            [index]="i"
                            [parentKey]="key"
                            [dockedSubmenu]="true"
                            [dockedPaneDepth]="1"
                            [class]="child['badgeClass']"></li>
                    </ng-container>
                </ul>
            </div>

            <!-- Slim docked depth ≥ 1: nested parents use accordion (dropdown) -->
            <div
                *ngIf="dockedSubmenu && item.items?.length && item.visible !== false && dockedPaneDepth > 0"
                class="layout-pane-accordion">
                <button
                    type="button"
                    class="layout-pane-accordion-trigger"
                    [class.layout-pane-accordion-trigger--open]="active"
                    [class.layout-pane-accordion-trigger--route-active]="routeActive"
                    (click)="itemClick($event)"
                    pRipple
                    [attr.aria-expanded]="active">
                    <i [ngClass]="dockedAccordionIconClasses"></i>
                    <span class="layout-menuitem-text">{{ item.label }}</span>
                    <i class="pi pi-angle-down layout-pane-accordion-chevron" [class.layout-pane-accordion-chevron--open]="active"></i>
                </button>
                <ul
                    #submenu
                    class="layout-pane-accordion-panel"
                    [@children]="submenuAnimation"
                    (@children.done)="onSubmenuAnimated($event)">
                    <ng-container *ngFor="let child of item.items; let i = index">
                        <li
                            app-menuitem
                            [item]="child"
                            [index]="i"
                            [parentKey]="key"
                            [dockedSubmenu]="true"
                            [dockedPaneDepth]="dockedPaneDepth + 1"
                            [class]="child['badgeClass']"></li>
                    </ng-container>
                </ul>
            </div>

            <!-- Menu with submenu (classic modes; not docked pane) -->
            <a
                *ngIf="(!item.routerLink || item.items) && item.visible !== false && !(dockedSubmenu && item.items?.length)"
                [attr.href]="item.url"
                (click)="itemClick($event)"
                (mouseenter)="onMouseEnter()"
                [ngClass]="item.class"
                [ngClass]="parentTriggerActiveAnchorClasses()"
                [attr.target]="item.target"
                tabindex="0"
                pRipple
                [pTooltip]="item.label"
                [tooltipDisabled]="!(isSlim() && root && !active)">
                <i [ngClass]="parentIconNgClass"></i>
                <span class="layout-menuitem-text">{{ item.label }}</span>
                <i
                    class="pi pi-fw pi-angle-down layout-submenu-toggler"
                    *ngIf="item.items"
                    [ngClass]="parentSubmenuTogglerAccentClasses()"></i>
            </a>

            <!-- Leaf menu item → open in tab -->
            <a
                *ngIf="item.routerLink && !item.items && item.visible !== false"
                (click)="openInTab($event)"
                (mouseenter)="onMouseEnter()"
                [ngClass]="item.class"
                [class.active-route]="isLeafRouteActive()"
                tabindex="0"
                pRipple
                [pTooltip]="item.label"
                [tooltipDisabled]="!(isSlim() && root)">
                <i [ngClass]="leafIconNgClass"></i>
                <span class="layout-menuitem-text">{{ item.label }}</span>
            </a>

            <!-- Submenu (animated collapse — hidden when docked flat group is used) -->
            <ul
                #submenu
                *ngIf="item.items && item.visible !== false && !(dockedSubmenu && item.items?.length)"
                [@children]="submenuAnimation"
                (@children.done)="onSubmenuAnimated($event)">
                <div *ngIf="root" class="border-b border-zinc-200 p-2 text-sm font-semibold text-zinc-900 mb-2">
                    {{ item.label }} Section
                </div>
                <ng-template ngFor let-child let-i="index" [ngForOf]="item.items">
                    <li app-menuitem [item]="child" [index]="i" [parentKey]="key" [class]="child['badgeClass']"></li>
                </ng-template>
            </ul>
        </ng-container>
    `,
    animations: [
        trigger('children', [
            state(
                'collapsed',
                style({
                    height: '0'
                })
            ),
            state(
                'expanded',
                style({
                    height: '*'
                })
            ),
            state(
                'hidden',
                style({
                    display: 'none'
                })
            ),
            state(
                'visible',
                style({
                    display: 'block'
                })
            ),
            transition('collapsed <=> expanded', animate('400ms cubic-bezier(0.86, 0, 0.07, 1)'))
        ])
    ]
})
export class AppMenuitem implements OnInit, OnDestroy {
    @Input() item: any;

    @Input() index!: number;

    @Input() @HostBinding('class.layout-root-menuitem') root!: boolean;

    @Input() parentKey!: string;

    /** When true (slim secondary pane), submenus expand in-place instead of flyout positioning. */
    @Input() dockedSubmenu = false;

    /** In docked pane: 0 = top section (flat), ≥1 = nested rows use accordion for parents with children. */
    @Input() dockedPaneDepth = 0;

    @ViewChild('submenu') submenu!: ElementRef;

    private readonly destroyRef = inject(DestroyRef);

    @HostBinding('class.active-menuitem')
    get activeClass() {
        return this.active;
    }

    @HostBinding('class.route-active')
    get routeActiveClass() {
        return this.routeActive;
    }

    active = false;

    routeActive = false;

    get isRootLeaf(): boolean {
        return this.root && typeof this.item?.class === 'string' && this.item.class.includes('root-leaf');
    }

    menuSourceSubscription: Subscription;

    menuResetSubscription: Subscription;

    key: string = '';

    get submenuAnimation() {
        if (this.dockedSubmenu) {
            return this.root ? 'expanded' : this.active ? 'expanded' : 'collapsed';
        }
        if (
            this.layoutService.isDesktop() &&
            (this.layoutService.isHorizontal() || this.layoutService.isSlim() || this.layoutService.isSlimPlus())
        ) {
            return this.active ? 'visible' : 'hidden';
        } else return this.root ? 'expanded' : this.active ? 'expanded' : 'collapsed';
    }

    isSlim = computed(() => this.layoutService.isSlim());

    isSlimPlus = computed(() => this.layoutService.isSlimPlus());

    isHorizontal = computed(() => this.layoutService.isHorizontal());

    get isDesktop() {
        return this.layoutService.isDesktop();
    }

    get isMobile() {
        return this.layoutService.isMobile();
    }

    constructor(
        public layoutService: LayoutService,
        public router: Router,
        private tabService: TabService,
        private cdr: ChangeDetectorRef
    ) {
        this.menuSourceSubscription = this.layoutService.menuSource$.subscribe((value) => {
            Promise.resolve(null).then(() => {
                if (value.routeEvent) {
                    this.active = value.key === this.key || value.key.startsWith(this.key + '-') ? true : false;
                } else {
                    if (value.key !== this.key && !value.key.startsWith(this.key + '-')) {
                        this.active = false;
                    }
                }
            });
        });

        this.menuResetSubscription = this.layoutService.resetSource$.subscribe(() => {
            this.active = false;
        });

        this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
            // in slim/horizontal, keep submenus closed after navigation (not docked pane items)
            if ((this.isSlimPlus() || this.isSlim() || this.isHorizontal()) && !this.dockedSubmenu) {
                this.active = false;
            } else {
                // in other modes, open the active menu path
                if (this.item.routerLink) {
                    this.updateActiveStateFromRoute();
                }
            }
            // always compute route-active for styling the root
            this.updateRouteActiveFromRoute();
        });

        merge(this.tabService.tabs$, this.tabService.activeIndex$)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.updateRouteActiveFromRoute();
                this.cdr.markForCheck();
            });
    }

    ngOnInit() {
        this.key = this.parentKey ? this.parentKey + '-' + this.index : String(this.index);

        if (!(this.isSlimPlus() || this.isSlim() || this.isHorizontal()) || this.dockedSubmenu) {
            if (this.item.routerLink) {
                this.updateActiveStateFromRoute();
            }
        }

        // compute initial route-active for all modes so roots can highlight
        this.updateRouteActiveFromRoute();
    }

    /**
     * Parent icon: default; strong `navAccent` fg when a child route is active; simple neutral fg when
     * only opened (`active`).
     */
    get parentIconNgClass(): string[] {
        const icon = this.item?.icon;
        const base = [icon, 'layout-menuitem-icon'].filter(Boolean) as string[];
        if (!this.item?.items?.length) {
            return base;
        }
        if (this.routeActive) {
            const [, fg] = menuNavAccentClasses(this.parentNavAccentKey());
            return [...base, fg];
        }
        if (this.active) {
            return [...base, MENU_PARENT_SIMPLE_SELECTED[1]];
        }
        return base;
    }

    /**
     * Parent `<a>`: strong `navAccent` when a child is current; simple zinc selected when only expanded
     * from click (`active` && !`routeActive`).
     */
    parentTriggerActiveAnchorClasses(): string[] {
        if (!this.item?.items?.length) {
            return [];
        }
        const rounded = this.parentTriggerRoundedClass();
        if (this.routeActive) {
            return [...menuNavAccentClasses(this.parentNavAccentKey()), rounded];
        }
        if (this.active) {
            return [...menuParentSimpleSelectedClasses(), rounded];
        }
        return [];
    }

    private parentTriggerRoundedClass(): string {
        const slimOrSlimPlus = this.layoutService.isSlim() || this.layoutService.isSlimPlus();
        const horizontal = this.layoutService.isHorizontal();
        return slimOrSlimPlus || horizontal ? '!rounded-xl' : '!rounded-r-lg';
    }

    /** Expanded vertical: section title — strong accent if child active, else simple selected if section open. */
    rootSectionTitleAccentClasses(): string[] {
        if (!this.root || !this.item?.items?.length) {
            return [];
        }
        if (this.routeActive) {
            return [...menuNavAccentClasses(this.parentNavAccentKey()), '!rounded-r-lg'];
        }
        if (this.active) {
            return [...menuParentSimpleSelectedClasses(), '!rounded-r-lg'];
        }
        return [];
    }

    /** Chevron matches icon/text (strong or simple) on parent rows. */
    parentSubmenuTogglerAccentClasses(): string[] {
        if (!this.item?.items?.length) {
            return [];
        }
        if (this.routeActive) {
            const [, fg] = menuNavAccentClasses(this.parentNavAccentKey());
            return [fg];
        }
        if (this.active) {
            return [MENU_PARENT_SIMPLE_SELECTED[1]];
        }
        return [];
    }

    private parentNavAccentKey(): MenuNavAccentKey {
        return isMenuNavAccentKey(this.item?.navAccent) ? this.item.navAccent : DEFAULT_MENU_NAV_ACCENT_KEY;
    }

    /** Submenu leaves only: saturated `navAccent` chip (same family as Cmd+K), not the soft variant. */
    get leafIconNgClass(): string[] {
        const icon = this.item?.icon;
        return [icon, 'layout-menuitem-icon', ...this.leafMenuIconWellClasses()].filter(Boolean) as string[];
    }

    private leafMenuIconWellClasses(): string[] {
        if (!this.item?.routerLink || this.item.items) {
            return [];
        }
        const accent = this.resolvedLeafNavAccentKey();
        if (this.dockedSubmenu) {
            return [...menuNavAccentClasses(accent), 'layout-menuitem-icon--chroma'];
        }
        return menuNavAccentClasses(accent);
    }

    private resolvedLeafNavAccentKey(): MenuNavAccentKey {
        if (isMenuNavAccentKey(this.item?.navAccent)) {
            return this.item.navAccent;
        }
        return menuNavAccentKeyForHash(this.key);
    }

    openInTab(event: Event) {
        event.preventDefault();
        if (!this.item.routerLink) return;

        const routerLinkArray = Array.isArray(this.item.routerLink) ? this.item.routerLink : [this.item.routerLink];
        const tabKey = this.buildTabKey(routerLinkArray);

        this.tabService.openTab({
            key: tabKey,
            title: this.item.label,
            routerLink: routerLinkArray
        });
    }
    ngAfterViewChecked() {
        if (
            this.dockedSubmenu ||
            !(this.root && this.active && this.isDesktop && (this.isHorizontal() || this.isSlim() || this.isSlimPlus()))
        ) {
            return;
        }
        this.calculatePosition(this.submenu?.nativeElement, this.submenu?.nativeElement.parentElement);
    }

    updateActiveStateFromRoute() {
        let activeRoute = this.router.isActive(this.item.routerLink[0], {
            paths: 'exact',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
        });

        if (activeRoute) {
            this.layoutService.onMenuStateChange({
                key: this.key,
                routeEvent: true
            });
        }
    }

    private isLinkActive(routerLink: any): boolean {
        if (!routerLink) return false;
        const path = Array.isArray(routerLink) ? routerLink[0] : routerLink;
        return this.router.isActive(path, {
            paths: 'exact',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
        });
    }

    /**
     * Whether this menu node or any descendant leaf matches the URL or the active tab key.
     */
    private itemHasActiveRoute(item: any, nodeKey: string): boolean {
        if (!item) {
            return false;
        }
        const isLeaf = !!(item.routerLink && !item.items);
        if (isLeaf) {
            const tab = this.tabService.getActiveTab();
            const rl = Array.isArray(item.routerLink) ? item.routerLink : [item.routerLink];
            const tabKey = this.buildTabKey(rl, nodeKey);
            const legacyKey = this.legacyTabKeyFromRouterLink(rl);
            return (
                this.isLinkActive(item.routerLink) ||
                (!!tab && (tab.key === tabKey || (legacyKey != null && tab.key === legacyKey)))
            );
        }
        if (item.items?.length) {
            return item.items.some((child: any, i: number) => this.itemHasActiveRoute(child, `${nodeKey}-${i}`));
        }
        return false;
    }

    private legacyTabKeyFromRouterLink(routerLinkArray: any[]): string | null {
        const normalized = (routerLinkArray || [])
            .map((segment: any) => String(segment ?? '').trim())
            .filter((segment: string) => !!segment)
            .join('/');
        return normalized || null;
    }

    private buildTabKey(routerLinkArray: any[], fallback = this.key): string {
        const normalized = (routerLinkArray || [])
            .map((segment: any) => String(segment ?? '').trim())
            .filter((segment: string) => !!segment)
            .join('/');
        return normalized ? `route:${normalized}` : fallback;
    }

    private updateRouteActiveFromRoute() {
        this.routeActive = this.itemHasActiveRoute(this.item, this.key);
        if (this.dockedSubmenu && this.dockedPaneDepth > 0 && this.item?.items?.length && this.routeActive) {
            this.active = true;
        }
    }

    /** Docked pane: saturated tile + white icon (same Tailwind system as slim rail). */
    get dockedAccordionIconClasses(): string[] {
        const icon = this.item?.icon;
        const base = [icon, 'layout-pane-accordion-icon'].filter(Boolean) as string[];
        const key = isMenuNavAccentKey(this.item?.navAccent)
            ? this.item.navAccent
            : menuNavAccentKeyForHash(this.key);
        return [...base, ...menuNavAccentClasses(key), 'layout-pane-accordion-icon--chroma'];
    }

    /** Highlight leaf row when route matches (vexo-style .active-route) or tab matches. */
    isLeafRouteActive(): boolean {
        if (!this.item?.routerLink || this.item.items) {
            return false;
        }
        if (this.isLinkActive(this.item.routerLink)) {
            return true;
        }
        const active = this.tabService.getActiveTab();
        const rl = Array.isArray(this.item.routerLink) ? this.item.routerLink : [this.item.routerLink];
        const tabKey = this.buildTabKey(rl);
        const legacyKey = this.legacyTabKeyFromRouterLink(rl);
        return !!active && (active.key === tabKey || (legacyKey != null && active.key === legacyKey));
    }
    onSubmenuAnimated(event: AnimationEvent) {
        if (
            this.dockedSubmenu ||
            !(event.toState === 'visible' && this.isDesktop && (this.isHorizontal() || this.isSlim() || this.isSlimPlus()))
        ) {
            return;
        }
        const el = <HTMLUListElement>event.element;
        const elParent = <HTMLUListElement>el.parentElement;
        this.calculatePosition(el, elParent);
    }

    calculatePosition(overlay: HTMLElement, target: HTMLElement) {
        if (overlay) {
            const { left } = target.getBoundingClientRect();
            const [vWidth, vHeight] = [window.innerWidth, window.innerHeight];
            const [oWidth, oHeight] = [overlay.offsetWidth, overlay.offsetHeight];
            const scrollbarWidth = DomHandler.calculateScrollbarWidth();
            // reset
            overlay.style.top = '';
            overlay.style.left = '';

            if (this.layoutService.isHorizontal()) {
                const width = left + oWidth + scrollbarWidth;
                overlay.style.left = vWidth < width ? `${left - (width - vWidth)}px` : `${left}px`;
            } else if (this.layoutService.isSlim() || this.layoutService.isSlimPlus()) {
                // Position relative to the parent item so it aligns exactly with the clicked icon
                const relativeTop = (target as HTMLElement).offsetTop;
                const targetRectTop = target.getBoundingClientRect().top;
                const height = targetRectTop + oHeight;
                overlay.style.top = vHeight < height ? `${relativeTop - (height - vHeight)}px` : `${relativeTop}px`;
            }
        }
    }
    toggleSubmenu() {
        this.active = !this.active;
    }
    itemClick(event: Event) {
        // avoid processing disabled items
        if (this.item.disabled) {
            event.preventDefault();
            return;
        }

        if (this.item.items) {
            this.toggleSubmenu();
            if (
                this.root &&
                this.active &&
                (this.isSlim() || this.isHorizontal() || this.isSlimPlus()) &&
                !this.dockedSubmenu
            ) {
                this.layoutService.onOverlaySubmenuOpen();
            }
        } else {
            if ((this.isSlim() || this.isHorizontal() || this.isSlimPlus()) && !this.dockedSubmenu) {
                this.layoutService.reset();
            }
        }

        this.layoutService.onMenuStateChange({ key: this.key });
    }

    onMouseEnter() {
        if (this.dockedSubmenu) {
            return;
        }
        if (this.root && (this.isSlim() || this.isHorizontal() || this.isSlimPlus()) && this.isDesktop) {
            if (this.layoutService.layoutState().menuHoverActive) {
                this.active = true;
                this.layoutService.onMenuStateChange({ key: this.key });
            }
        }
    }

    ngOnDestroy() {
        if (this.menuSourceSubscription) {
            this.menuSourceSubscription.unsubscribe();
        }

        if (this.menuResetSubscription) {
            this.menuResetSubscription.unsubscribe();
        }
    }

    shouldShowRootText() {
        // Show root text only when sidebar is active/expanded
        return this.layoutService.layoutState().sidebarActive;
    }
}
