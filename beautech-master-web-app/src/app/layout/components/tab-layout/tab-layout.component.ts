import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AppTab, TabService } from '@/layout/components/tab-service';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';

@Component({
    selector: 'app-tab-layout',
    standalone: true,
    imports: [CommonModule, RouterOutlet, IconField, InputIcon, InputText],
    styleUrls: ['./tab-layout.component.scss'],
    template: `
      <div class="pill-tabs-container" *ngIf="!isDashboardRoute && openedTabs.length > 0">
        <div class="pill-tabs-shell">
          <div #tabsStrip class="pill-tabs-strip" role="tablist" aria-label="Open tabs">
            <div
              *ngFor="let tab of visibleTabs; let i = index"
              #tabEl
              class="pill-tab"
              role="tab"
              [attr.aria-selected]="tab.originalIndex === activeIndex"
              [class.active]="tab.originalIndex === activeIndex"
              (click)="onTabChange(tab.originalIndex)"
            >
              <div class="pill-tab-content">
                <span class="pill-tab-title">{{ tab.title }}</span>
                <button
                  type="button"
                  class="pill-tab-close"
                  (click)="onTabClose(tab.originalIndex); $event.stopPropagation()"
                  (mouseenter)="$event.stopPropagation()"
                  aria-label="Close tab"
                >
                  <i class="pi pi-times"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Hidden measurement strip (always renders all tabs so overflow calc is stable) -->
          <div class="pill-tabs-measure" aria-hidden="true">
            <div
              *ngFor="let tab of openedTabs; let i = index"
              #measureTabEl
              class="pill-tab pill-tab--measure"
            >
              <div class="pill-tab-content">
                <span class="pill-tab-title">{{ tab.title }}</span>
                <button type="button" class="pill-tab-close" tabindex="-1" aria-hidden="true">
                  <i class="pi pi-times"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="pill-tabs-actions" aria-label="Tab actions">
            <div class="pill-tabs-more" *ngIf="hasOverflow">
              <button
                type="button"
                class="pill-tabs-action"
                (click)="toggleMore(); $event.stopPropagation()"
                title="More tabs"
                aria-label="More tabs"
                [attr.aria-expanded]="moreOpen"
              >
                <i class="pi pi-ellipsis-h"></i>
                <span class="pill-tabs-action__label">More</span>
              </button>

              <div class="pill-tabs-more__panel" *ngIf="moreOpen" (click)="$event.stopPropagation()">
                <div class="pill-tabs-more__header">
                  <span class="pill-tabs-more__title">More tabs</span>
                  <button type="button" class="pill-tabs-more__close" (click)="moreOpen=false" aria-label="Close menu">
                    <i class="pi pi-times"></i>
                  </button>
                </div>

                <div class="pill-tabs-more__search">
                  <p-iconField iconPosition="left" class="w-full">
                    <p-inputIcon>
                      <i class="pi pi-search"></i>
                    </p-inputIcon>
                    <input
                      pInputText
                      type="text"
                      class="pill-tabs-more__searchInput w-full"
                      [value]="moreQuery"
                      (input)="setMoreQuery(($any($event.target).value || '').toString()); $event.stopPropagation()"
                      placeholder="Search tabs…"
                      aria-label="Search tabs"
                    />
                  </p-iconField>
                </div>

                <div class="pill-tabs-more__list">
                  <div
                    *ngFor="let tab of overflowTabs"
                    class="pill-tabs-more__item"
                    [class.active]="tab.originalIndex === activeIndex"
                    (click)="onTabChange(tab.originalIndex); moreOpen=false"
                    role="button"
                    tabindex="0"
                  >
                    <div class="pill-tabs-more__meta">
                      <div class="pill-tabs-more__name">{{ tab.title }}</div>
                      <div class="pill-tabs-more__sub" *ngIf="tab.routerLink.length">{{ tab.routerLink.join(' ') }}</div>
                    </div>
                    <button
                      type="button"
                      class="pill-tabs-more__x"
                      (click)="onTabClose(tab.originalIndex); $event.stopPropagation()"
                      aria-label="Close tab"
                      title="Close"
                    >
                      <i class="pi pi-times"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="pill-tabs-action"
              (click)="onCloseAllTabs(); $event.stopPropagation()"
              title="Close all tabs"
              aria-label="Close all tabs"
            >
              <i class="pi pi-times"></i>
              <span class="pill-tabs-action__label">Close all</span>
            </button>
          </div>
        </div>
      </div>

      <div class="tab-content-container">
        <router-outlet></router-outlet>
      </div>
    `
})
export class TabLayoutComponent implements OnInit, AfterViewInit, OnDestroy {
    openedTabs: AppTab[] = [];
    activeIndex: number = -1; // No tab selected by default
    isDashboardRoute: boolean = false;
    private isInitialLoad: boolean = true;

    @ViewChild('tabsStrip') tabsStrip?: ElementRef<HTMLElement>;
    @ViewChildren('tabEl') tabEls?: QueryList<ElementRef<HTMLElement>>;
    @ViewChildren('measureTabEl') measureTabEls?: QueryList<ElementRef<HTMLElement>>;

    // Overflow handling
    visibleTabs: Array<AppTab & { originalIndex: number }> = [];
    overflowTabs: Array<AppTab & { originalIndex: number }> = [];
    hasOverflow = false;
    moreOpen = false;
    moreQuery = '';
    private ro?: ResizeObserver;

    constructor(private tabService: TabService, private router: Router) {}

    ngOnInit() {
        // Force navigate to the Register home on initial load
        this.router.navigate(['/register'], { replaceUrl: true });
        this.checkDashboardRoute(this.router.url);
        
        // Clear any stored active index to prevent navigation to old tabs
        this.tabService.setActiveIndex(-1);

        // Subscribe to route changes
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe((event: any) => {
                this.checkDashboardRoute(event.url);
                // After first route change, allow tab navigation
                if (this.isInitialLoad) {
                    setTimeout(() => {
                        this.isInitialLoad = false;
                    }, 500);
                }
            });

        // Subscribe to tabs
        this.tabService.tabs$.subscribe(tabs => {
            this.openedTabs = tabs;
            this.moreOpen = false;
            // Defer to allow DOM to render before measuring.
            setTimeout(() => this.recomputeOverflow(), 0);
            
            // If no tabs exist, ensure we're on the Register home
            if (tabs.length === 0) {
                if (!this.isDashboardRoute) {
                    this.router.navigate(['/register'], { replaceUrl: true });
                }
            }
        });

        // Subscribe to active index - only navigate when user explicitly clicks
        this.tabService.activeIndex$.subscribe(idx => {
            this.activeIndex = idx;
            // Keep active tab visible in the strip when possible.
            setTimeout(() => this.recomputeOverflow(), 0);

            // Only navigate if:
            // 1. Valid index
            // 2. Not during initial load
            // 3. User explicitly clicked (not from stored state)
            if (idx >= 0 && idx < this.openedTabs.length && !this.isInitialLoad) {
                const tab = this.openedTabs[idx];
                if (tab && tab.routerLink) {
                    // Navigate to the tab's route
                    this.router.navigate(tab.routerLink, { queryParams: tab.queryParams });
                }
            }
        });
        
        // Mark initial load as complete after delay to prevent auto-navigation
        setTimeout(() => {
            this.isInitialLoad = false;
        }, 1000);
    }

    ngAfterViewInit(): void {
        const el = this.tabsStrip?.nativeElement;
        if (!el) return;

        // Observe size changes so overflow menu updates on window resize / sidebar changes.
        this.ro = new ResizeObserver(() => this.recomputeOverflow());
        this.ro.observe(el);
    }

    ngOnDestroy(): void {
        this.ro?.disconnect();
    }

    private checkDashboardRoute(url: string): void {
        // The Register screen is the home: show it full-bleed without the pill-tab strip.
        const path = (url || '').split('?')[0];
        this.isDashboardRoute = path === '/' || path === '' || path === '/register';
    }

    onTabChange(index: number) {
        this.tabService.setActiveIndex(index);
    }

    onTabClose(index: number) {
        const wasLastTab = this.openedTabs.length === 1;
        this.tabService.closeTab(index);
        
        // If all tabs are closed, navigate to the Register home
        if (wasLastTab) {
            setTimeout(() => {
                if (this.openedTabs.length === 0) {
                    this.router.navigate(['/register'], { replaceUrl: true });
                }
            }, 100);
        }
    }

    onCloseAllTabs() {
        this.tabService.closeAllTabs();
        setTimeout(() => {
            this.router.navigate(['/register'], { replaceUrl: true });
        }, 0);
    }

    toggleMore(): void {
        this.moreOpen = !this.moreOpen;
        if (!this.moreOpen) this.moreQuery = '';
    }

    setMoreQuery(v: string): void {
        this.moreQuery = v;
    }

    private recomputeOverflow(): void {
        const strip = this.tabsStrip?.nativeElement;
        if (!strip) {
            this.visibleTabs = this.openedTabs.map((t, i) => ({ ...t, originalIndex: i }));
            this.overflowTabs = [];
            this.hasOverflow = false;
            return;
        }

        // Available width for tabs area (actions are outside the strip now, so strip width is real available).
        const available = strip.clientWidth;
        if (available <= 0) return;

        // Measure widths from the hidden strip (always contains ALL tabs)
        const measureEls = this.measureTabEls?.toArray?.() || [];
        const widths = measureEls.map(r => r.nativeElement.getBoundingClientRect().width || 0);

        // If we can't measure (first paint), fall back to showing all.
        if (!widths.length || widths.length !== this.openedTabs.length) {
            this.visibleTabs = this.openedTabs.map((t, i) => ({ ...t, originalIndex: i }));
            this.overflowTabs = [];
            this.hasOverflow = false;
            return;
        }

        // Reserve some space for the "More" button in the actions area only when overflow happens.
        // Since actions live outside strip, we don't subtract it here.

        let used = 0;
        let count = 0;
        for (let i = 0; i < widths.length; i++) {
            const w = widths[i];
            // stop when next tab doesn't fit
            if (used + w > available) break;
            used += w;
            count++;
        }

        // Always show at least 1 tab
        count = Math.max(1, count);

        const mappedAll = this.openedTabs.map((t, i) => ({ ...t, originalIndex: i }));
        const mapped = mappedAll;

        let visible = mapped.slice(0, count);
        let overflow = mapped.slice(count);

        this.hasOverflow = overflow.length > 0;

        // If active tab is in overflow, swap it into the last visible slot.
        const active = this.activeIndex;
        if (active >= 0 && overflow.some(t => t.originalIndex === active)) {
            const activeTab = mappedAll[active];
            visible[visible.length - 1] = activeTab;
            overflow = mapped.filter(t => !visible.some(v => v.originalIndex === t.originalIndex));
        }

        this.visibleTabs = visible;
        // Filter overflow list by query (search)
        const q = (this.moreQuery || '').trim().toLowerCase();
        this.overflowTabs = q
            ? overflow.filter(t => (t.title || '').toLowerCase().includes(q))
            : overflow;
    }
}
