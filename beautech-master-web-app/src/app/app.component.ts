import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { NetworkStore } from '@/core/network.store';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule],
    template: `<router-outlet></router-outlet>`
})
export class AppComponent implements OnInit, OnDestroy {
    private readonly appTitle = 'The Grand — Inventory';
    private network = inject(NetworkStore);
    private title = inject(Title);

    ngOnInit(): void {
        this.network.startWatching();
        this.title.setTitle(this.appTitle);
    }

    ngOnDestroy(): void {
        this.network.stopWatching();
    }
}
