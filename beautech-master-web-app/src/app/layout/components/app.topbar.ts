import { Component, ElementRef, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StyleClassModule } from 'primeng/styleclass';
import { LayoutService } from '@/layout/service/layout.service';
import { AppBreadcrumb } from './app.breadcrumb';
import { ButtonModule } from 'primeng/button';
import { Avatar } from 'primeng/avatar';
import { Divider } from 'primeng/divider';
import { DrawerModule } from 'primeng/drawer';
import { AppProfileSidebar } from '@/layout/components/app.profilesidebar';

@Component({
    selector: '[app-topbar]',
    standalone: true,
    imports: [RouterModule, CommonModule, FormsModule, StyleClassModule, AppBreadcrumb, ButtonModule, Avatar, Divider, DrawerModule, AppProfileSidebar],
    template: `
        <div class="layout-topbar">
            <div class="topbar-start">
                <button #menubutton type="button" class="topbar-menubutton p-link p-trigger" (click)="onMenuButtonClick()">
                    <i class="pi pi-bars"></i>
                </button>

                <p-divider layout="vertical" />
                <nav app-breadcrumb class="topbar-breadcrumb"></nav>
            </div>

            <div class="topbar-end">
                <ul class="topbar-menu">
                    <li class="ml-3">
                        <p-button icon="pi pi-palette" rounded text (onClick)="onConfigButtonClick()" aria-label="Theme"></p-button>
                    </li>
                    <li class="topbar-profile" (click)="onProfileButtonClick()">
                        <p-avatar label="A" class="mr-2" shape="circle" />
                    </li>
                </ul>
            </div>
        </div>
        <p-drawer [(visible)]="showUserSidebar" position="right" [baseZIndex]="10000">
            <app-profilesidebar></app-profilesidebar>
        </p-drawer>
    `
})
export class AppTopbar {
    @ViewChild('menubutton') menuButton!: ElementRef;
    showUserSidebar = false;

    constructor(public layoutService: LayoutService) {}

    onMenuButtonClick() {
        this.layoutService.onMenuToggle();
    }

    onProfileButtonClick() {
        this.showUserSidebar = true;
    }

    onConfigButtonClick() {
        this.layoutService.showConfigSidebar();
    }
}
