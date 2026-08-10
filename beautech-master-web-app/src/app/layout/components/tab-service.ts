// src/app/services/tab.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AppTab {
    key: string;
    title: string;
    routerLink: any[];
    queryParams?: Record<string, any>;
    component?: any;
}

const LOCAL_STORAGE_TABS = 'recentTabs';
const LOCAL_STORAGE_ACTIVE_INDEX = 'mainActiveTabIndex';

// Default tab
const DEFAULT_TAB: AppTab = {
    key: 'dashboard',
    title: 'Dashboard',
    routerLink: ['/']
};

@Injectable({ providedIn: 'root' })
export class TabService {
    private tabsSubject = new BehaviorSubject<AppTab[]>([]);
    tabs$ = this.tabsSubject.asObservable();

    private activeIndexSubject = new BehaviorSubject<number>(-1); // No tab selected by default
    activeIndex$ = this.activeIndexSubject.asObservable();

    constructor() {
        this.loadTabsFromStorage();
    }

    private loadTabsFromStorage() {
        const storedTabs = localStorage.getItem(LOCAL_STORAGE_TABS);
        const storedIndex = localStorage.getItem(LOCAL_STORAGE_ACTIVE_INDEX);

        let tabs: AppTab[] = [];
        let activeIndex = -1; // No tab selected by default - always start with dashboard

        if (storedTabs) {
            try {
                tabs = JSON.parse(storedTabs);
                tabs = tabs.filter((tab) => {
                    const firstRoute = Array.isArray(tab?.routerLink) ? tab.routerLink[0] : '';
                    return ![
                        '/projects',
                        '/emails',
                        '/pbi-dashboard',
                        '/starta-companies'
                    ].some((removedPrefix) => typeof firstRoute === 'string' && firstRoute.startsWith(removedPrefix));
                });
            } catch {
                tabs = [];
            }
        }

        // Don't restore active index on initial load - always start with dashboard
        // Active index will be set when user explicitly clicks a tab
        // This ensures dashboard loads by default

        // Save filtered tabs back to storage if we removed any
        if (tabs.length > 0) {
            this.saveTabsToStorage(tabs, -1);
        } else {
            // Clear storage if no valid tabs
            localStorage.removeItem(LOCAL_STORAGE_TABS);
            localStorage.removeItem(LOCAL_STORAGE_ACTIVE_INDEX);
        }

        this.tabsSubject.next(tabs);
        this.activeIndexSubject.next(activeIndex);
    }

    private saveTabsToStorage(tabs: AppTab[], activeIndex: number) {
        localStorage.setItem(LOCAL_STORAGE_TABS, JSON.stringify(tabs));
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_INDEX, JSON.stringify(activeIndex));
    }

    openTab(tab: AppTab) {
        const tabs = this.tabsSubject.getValue();
        const existingIndex = tabs.findIndex(t => t.key === tab.key);

        if (existingIndex !== -1) {
            // Tab exists: Just switch to it
            this.setActiveIndex(existingIndex);
        } else {
            // 1. Prepare new array
            const newTabs = [...tabs, tab];
            const newIndex = newTabs.length - 1;

            // 2. Push the new tabs array FIRST so the HTML can start rendering
            this.tabsSubject.next(newTabs);

            // 3. Update the index in a way that triggers the component's logic
            this.setActiveIndex(newIndex);

            // 4. Persistence
            this.saveTabsToStorage(newTabs, newIndex);
        }
    }

    closeTab(index: number) {
        const tabs = this.tabsSubject.getValue();
        if (index < 0 || index >= tabs.length) return;

        tabs.splice(index, 1);
        let activeIndex = this.activeIndexSubject.getValue();

        if (activeIndex === index) {
            // If closing the active tab, select the previous one or -1 if no tabs left
            activeIndex = tabs.length > 0 ? Math.max(0, index - 1) : -1;
        } else if (activeIndex > index) {
            activeIndex--;
        }

        this.tabsSubject.next([...tabs]);
        this.activeIndexSubject.next(activeIndex);
        this.saveTabsToStorage(tabs, activeIndex);
    }

    closeAllTabs() {
        this.tabsSubject.next([]);
        this.activeIndexSubject.next(-1);
        localStorage.removeItem(LOCAL_STORAGE_TABS);
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_INDEX);
    }

    setActiveIndex(index: number) {
        const tabs = this.tabsSubject.getValue();
        // Allow -1 to deselect all tabs, or valid index
        if (index < -1 || index >= tabs.length) return;

        this.activeIndexSubject.next(index);
        this.saveTabsToStorage(tabs, index);
    }

    initTabs(initialTabs: AppTab[]) {
        if (!initialTabs || !initialTabs.length) {
            initialTabs = [DEFAULT_TAB];
        }
        this.tabsSubject.next(initialTabs);
        this.activeIndexSubject.next(0);
        this.saveTabsToStorage(initialTabs, 0);
    }

    /** Active tab (for menu highlighting when router URL is unchanged). */
    getActiveTab(): AppTab | null {
        const tabs = this.tabsSubject.getValue();
        const i = this.activeIndexSubject.getValue();
        if (i < 0 || i >= tabs.length) {
            return null;
        }
        return tabs[i] ?? null;
    }

    updateTab(oldKey: string, updatedTab: Partial<AppTab>) {
        const tabs = this.tabsSubject.getValue();
        const index = tabs.findIndex(t => t.key === oldKey);

        if (index === -1) return;

        const updatedTabs = [...tabs];
        updatedTabs[index] = {
            ...updatedTabs[index],
            ...updatedTab
        };

        this.tabsSubject.next(updatedTabs);

        const activeIndex = this.activeIndexSubject.getValue();
        this.saveTabsToStorage(updatedTabs, activeIndex);
    }
}
