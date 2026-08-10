import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppMenu } from './app.menu';
import { LayoutService } from '@/layout/service/layout.service';
import { RouterModule } from '@angular/router';

@Component({
    selector: '[app-sidebar]',
    standalone: true,
    imports: [CommonModule, AppMenu, RouterModule],
    template: ` <div class="layout-sidebar" (mouseenter)="onMouseEnter()" (mouseleave)="onMouseLeave()">
        <div class="sidebar-header" *ngIf="!layoutService.isSlim()">
            <a [routerLink]="['/']" class="app-logo flex items-center gap-2">
                <i class="pi pi-bolt text-2xl text-primary"></i>
                <span class="app-logo-text text-xl font-semibold">Apollo</span>
            </a>
        </div>

        <div #menuContainer class="layout-menu-container">
            <app-menu></app-menu>
        </div>
    </div>`
})
export class AppSidebar {
    timeout: any = null;

    @ViewChild('menuContainer') menuContainer!: ElementRef;
    constructor(
        public layoutService: LayoutService,
        public el: ElementRef
    ) {}

    onMouseEnter() {
        if (this.layoutService.isSlim()) {
            return;
        }
        if (!this.layoutService.layoutState().anchored) {

            if (this.timeout) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }

            this.layoutService.layoutState.update((state) => {
                if (!state.sidebarActive) {
                    return {
                        ...state,
                        sidebarActive: true,
                        anchored: true
                    };

                }
                return state;
            });


        }
    }

    onMouseLeave() {
        if (this.layoutService.isSlim()) {
            return;
        }
        if (this.layoutService.layoutState().anchored) {
            if (!this.timeout) {
                this.timeout = setTimeout(() => {
                    this.layoutService.layoutState.update((state) => {
                        if (state.sidebarActive) {
                            return {
                                ...state,
                                sidebarActive: false,
                                anchored: false
                            };
                        }
                        return state;
                    });

                }, 300);
            }
        }
    }

    anchor() {
        this.layoutService.layoutState.update((state) => ({
            ...state,
            anchored: !state.anchored
        }));
    }

    closeSidebar() {
        this.layoutService.layoutState.update((state) => ({
            ...state,
            sidebarActive: false,
            anchored: false
        }));
    }
}
