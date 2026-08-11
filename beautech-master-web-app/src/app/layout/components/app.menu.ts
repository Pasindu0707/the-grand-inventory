import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { applyLeafNavAccentCycle } from '@/shared/navigation';
import { AppMenuitem } from './app.menuitem';
import { filter, Subscription } from 'rxjs';
import { LayoutService } from '@/layout/service/layout.service';
import { TabService } from '@/layout/components/tab-service';
import { TooltipModule } from 'primeng/tooltip';
import { RippleModule } from 'primeng/ripple';
import { AuthStore } from '@/core/auth.store';
import type { RouteKey } from '@/core/types';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuitem, RouterModule, TooltipModule, RippleModule],
    host: {
        class: 'layout-app-menu'
    },
    template: `
        <ng-container *ngIf="layoutService.isSlim(); else classicMenuTpl">
            <div class="layout-nav-dual" (mouseleave)="onRailAreaLeave()">
                <nav class="layout-rail-nav" aria-label="Main sections">
                    <ul class="layout-rail-list">
                        <li class="layout-rail-item layout-rail-item--home">
                            <a
                                routerLink="/today"
                                class="layout-rail-home"
                                [class.layout-rail-home--active]="isSlimRailHomeActive()"
                                (click)="onSlimRailHomeClick($event)"
                                pRipple
                                pTooltip="Today"
                                tooltipPosition="right"
                                aria-label="Today">
                                <i class="pi pi-home" aria-hidden="true"></i>
                            </a>
                        </li>
                        <li class="layout-rail-divider" role="separator" aria-hidden="true"></li>
                        <ng-container *ngFor="let item of model; let i = index">
                            <li *ngIf="item.separator" class="layout-rail-divider" role="separator" aria-hidden="true"></li>
                            <li *ngIf="!item.separator && item.visible !== false" class="layout-rail-item">
                                <button
                                    *ngIf="item.items?.length"
                                    type="button"
                                    class="layout-rail-button"
                                    [class.layout-rail-button--active]="activeRailIndex === i && layoutService.layoutState().slimNavPaneOpen"
                                    [class.layout-rail-button--route]="isRailRootRouteActive(item, railKey(i))"
                                    (click)="onRailIconClick(i)"
                                    (mouseenter)="onRailEnter(i)"
                                    pRipple
                                    [pTooltip]="item.label"
                                    tooltipPosition="right"
                                    [attr.aria-expanded]="activeRailIndex === i && !!layoutService.layoutState().slimNavPaneOpen">
                                    <i [ngClass]="item.icon" class="layout-rail-button-icon"></i>
                                </button>
                                <button
                                    *ngIf="!item.items?.length && item.routerLink"
                                    type="button"
                                    class="layout-rail-button"
                                    [class.layout-rail-button--route]="isLinkActive(item.routerLink)"
                                    (click)="openRootLeafInTab($event, item)"
                                    pRipple
                                    [pTooltip]="item.label"
                                    tooltipPosition="right">
                                    <i [ngClass]="item.icon" class="layout-rail-button-icon"></i>
                                </button>
                            </li>
                        </ng-container>
                    </ul>
                </nav>
                <aside class="layout-nav-pane" *ngIf="railPaneVisible()" (mouseenter)="onPaneEnter()">
                    <div class="layout-nav-pane-scroll">
                        <ul class="layout-menu layout-menu-pane">
                            <li
                                app-menuitem
                                *ngFor="let child of activeRailRoot?.items; let j = index"
                                [item]="child"
                                [index]="j"
                                [parentKey]="activeRailParentKey"
                                [root]="false"
                                [dockedSubmenu]="true"
                                [dockedPaneDepth]="0"
                                [class]="child['badgeClass']"></li>
                        </ul>
                    </div>
                </aside>
            </div>
        </ng-container>
        <ng-template #classicMenuTpl>
            <ul class="layout-menu">
                <ng-container *ngFor="let item of model; let i = index">
                    <li app-menuitem *ngIf="!item.separator" [item]="item" [index]="i" [root]="true"></li>
                    <li *ngIf="item.separator" class="menu-separator"></li>
                </ng-container>
            </ul>
        </ng-template>
    `
})
export class AppMenu implements OnInit, OnDestroy {
    model: any[] = [];
    /** Selected root section index for slim icon rail + pane. */
    activeRailIndex: number | null = null;
    private routerSub?: Subscription;
    /** Pending close of the hover flyout (small grace period to cross the gap). */
    private paneCloseTimer: any = null;

    constructor(
        private router: Router,
        public layoutService: LayoutService,
        private tabService: TabService,
        private auth: AuthStore
    ) {}

    ngOnInit() {
        this.rebuildMenuModel();
        this.routerSub = this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
            this.syncActiveRailFromRoute();
        });
    }

    ngOnDestroy(): void {
        this.routerSub?.unsubscribe();
    }

    private rebuildMenuModel(): void {
        const gate = (key: RouteKey) => this.auth.canUseRoute(key);

        // Grouped by what someone is doing, not by which table it touches.
        // Issues, wastage, counts, cleaning and the five reports arrive with
        // their slices; the groups appear when they have something in them.
        const baseModel = [
            {
                label: 'Store',
                icon: 'pi pi-fw pi-home',
                items: [
                    { label: 'Today', icon: 'pi pi-fw pi-home', routerLink: ['/today'], visible: gate('today') },
                    { label: 'Stock', icon: 'pi pi-fw pi-box', routerLink: ['/stock'], visible: gate('stock') }
                ]
            },
            {
                label: 'Goods in',
                icon: 'pi pi-fw pi-truck',
                items: [
                    { label: 'Receive delivery', icon: 'pi pi-fw pi-truck', routerLink: ['/grn'], visible: gate('grn') },
                    { label: 'Market purchase', icon: 'pi pi-fw pi-wallet', routerLink: ['/market'], visible: gate('market') }
                ]
            },
            {
                label: 'Goods out',
                icon: 'pi pi-fw pi-arrow-right-arrow-left',
                items: [
                    { label: 'Issues', icon: 'pi pi-fw pi-send', routerLink: ['/issues'], visible: gate('issues') },
                    { label: 'Wastage', icon: 'pi pi-fw pi-trash', routerLink: ['/wastage'], visible: gate('wastage') }
                ]
            },
            {
                label: 'Control',
                icon: 'pi pi-fw pi-check-square',
                items: [
                    { label: 'Stock count', icon: 'pi pi-fw pi-check-square', routerLink: ['/counts'], visible: gate('counts') },
                    { label: 'Cleaning', icon: 'pi pi-fw pi-sparkles', routerLink: ['/cleaning'], visible: gate('cleaning') }
                ]
            }
        ];

        // Drop groups whose children are all hidden.
        const filtered = baseModel.filter((g) => !g.items || g.items.some((i: any) => i.visible !== false));

        this.model = applyLeafNavAccentCycle(filtered);
        this.syncActiveRailFromRoute();
    }

    get activeRailRoot(): any | null {
        if (this.activeRailIndex == null || !this.model[this.activeRailIndex]) {
            return null;
        }
        return this.model[this.activeRailIndex];
    }

    get activeRailParentKey(): string {
        return this.activeRailIndex == null ? '' : String(this.activeRailIndex);
    }

    railKey(i: number): string {
        return String(i);
    }

    railPaneVisible(): boolean {
        if (!this.layoutService.isSlim()) {
            return false;
        }
        if (this.activeRailIndex == null || !this.activeRailRoot?.items?.length) {
            return false;
        }
        const s = this.layoutService.layoutState();
        return !!s.slimNavPaneOpen || !!s.staticMenuMobileActive;
    }

    onRailIconClick(index: number): void {
        const item = this.model[index];
        if (!item?.items?.length) {
            return;
        }
        const paneOpen = !!this.layoutService.layoutState().slimNavPaneOpen;
        if (this.activeRailIndex === index && paneOpen) {
            this.layoutService.setSlimNavPaneOpen(false);
            return;
        }
        this.activeRailIndex = index;
        this.layoutService.setSlimNavPaneOpen(true);
        this.layoutService.reset();
    }

    /** Desktop: reveal a section's submenu as a hover flyout. */
    onRailEnter(index: number): void {
        if (!this.layoutService.isDesktop()) {
            return;
        }
        const item = this.model[index];
        if (!item?.items?.length) {
            return;
        }
        if (this.paneCloseTimer) {
            clearTimeout(this.paneCloseTimer);
            this.paneCloseTimer = null;
        }
        this.activeRailIndex = index;
        this.layoutService.setSlimNavPaneOpen(true);
        this.layoutService.reset();
    }

    /** Keep the flyout open while the pointer is inside it. */
    onPaneEnter(): void {
        if (this.paneCloseTimer) {
            clearTimeout(this.paneCloseTimer);
            this.paneCloseTimer = null;
        }
    }

    /** Pointer left the rail + flyout: close the flyout after a short grace period. */
    onRailAreaLeave(): void {
        if (!this.layoutService.isDesktop()) {
            return;
        }
        if (this.paneCloseTimer) {
            clearTimeout(this.paneCloseTimer);
        }
        this.paneCloseTimer = setTimeout(() => {
            this.layoutService.setSlimNavPaneOpen(false);
            this.paneCloseTimer = null;
        }, 220);
    }

    /**
     * Top rail "home / app" control (Today). Opens like any other nav leaf so the
     * currently open section pane is preserved instead of being force-closed.
     */
    onSlimRailHomeClick(event: Event): void {
        this.openRootLeafInTab(event, { label: 'Today', routerLink: ['/today'] });
    }

    isSlimRailHomeActive(): boolean {
        const onHome =
            this.router.isActive('/today', {
                paths: 'exact',
                queryParams: 'ignored',
                matrixParams: 'ignored',
                fragment: 'ignored'
            }) ||
            this.router.isActive('/', {
                paths: 'exact',
                queryParams: 'ignored',
                matrixParams: 'ignored',
                fragment: 'ignored'
            });
        return onHome;
    }

    openRootLeafInTab(event: Event, item: any): void {
        event.preventDefault();
        if (!item.routerLink) {
            return;
        }
        const routerLinkArray = Array.isArray(item.routerLink) ? item.routerLink : [item.routerLink];
        const tabKey = this.buildTabKey(routerLinkArray);
        this.tabService.openTab({
            key: tabKey,
            title: item.label,
            routerLink: routerLinkArray
        });
        if (!this.layoutService.isDesktop()) {
            this.layoutService.layoutState.update((prev) => ({ ...prev, staticMenuMobileActive: false }));
        }
    }

    isRailRootRouteActive(item: any, nodeKey: string): boolean {
        return this.itemHasActiveRoute(item, nodeKey);
    }

    isLinkActive(routerLink: any): boolean {
        if (!routerLink) {
            return false;
        }
        const path = Array.isArray(routerLink) ? routerLink[0] : routerLink;
        return this.router.isActive(path, {
            paths: 'exact',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
        });
    }

    private syncActiveRailFromRoute(): void {
        if (!this.layoutService.isSlim()) {
            return;
        }
        // On desktop the secondary pane is a hover-only flyout - it must never stay
        // docked open after navigating. We only track which rail icon is "current"
        // (for the highlight); the pane itself opens on mouse-enter (onRailEnter).
        if (this.layoutService.isDesktop()) {
            this.layoutService.setSlimNavPaneOpen(false);
        }
        const idx = this.findRootIndexMatchingRoute();
        if (idx != null) {
            this.activeRailIndex = idx;
        } else if (this.activeRailIndex != null && this.activeRailIndex >= this.model.length) {
            this.activeRailIndex = null;
        }
    }

    private findRootIndexMatchingRoute(): number | null {
        for (let i = 0; i < this.model.length; i++) {
            const item = this.model[i];
            if (item.separator || item.visible === false) {
                continue;
            }
            if (this.itemHasActiveRoute(item, String(i))) {
                return i;
            }
        }
        return null;
    }

    private itemHasActiveRoute(item: any, nodeKey: string): boolean {
        if (!item) {
            return false;
        }
        const isLeaf = !!(item.routerLink && !item.items?.length);
        if (isLeaf) {
            const tab = this.tabService.getActiveTab();
            const rl = Array.isArray(item.routerLink) ? item.routerLink : [item.routerLink];
            const tabKey = this.buildTabKey(rl);
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

    private buildTabKey(routerLinkArray: any[]): string {
        const normalized = (routerLinkArray || [])
            .map((segment: any) => String(segment ?? '').trim())
            .filter((segment: string) => !!segment)
            .join('/');
        return normalized ? `route:${normalized}` : '';
    }

    private legacyTabKeyFromRouterLink(routerLinkArray: any[]): string | null {
        const normalized = (routerLinkArray || [])
            .map((segment: any) => String(segment ?? '').trim())
            .filter((segment: string) => !!segment)
            .join('/');
        return normalized || null;
    }
}


