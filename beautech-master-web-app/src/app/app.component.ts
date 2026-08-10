import {Component, OnDestroy, OnInit, effect, inject} from '@angular/core';
import {NavigationEnd, Router, RouterModule} from '@angular/router';
import {Title} from '@angular/platform-browser';
import {Subscription} from 'rxjs';
import {filter} from 'rxjs/operators';
import {NetworkStore} from '@/pos/stores/network.store';
import {AuthStore} from '@/pos/stores/auth.store';
import {setActiveCurrency} from '@/pos/core/money';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule],
    template: `
        <router-outlet></router-outlet>`
})
export class AppComponent implements OnInit, OnDestroy {
    private readonly appTitle = 'VendEasy POS';
    private navSub?: Subscription;

    private network = inject(NetworkStore);
    private auth = inject(AuthStore);

    constructor(
        private router: Router,
        private title: Title
    ) {
        // Currency follows the active tenant's currencyCode.
        effect(() => {
            const tenant = this.auth.tenant();
            if (tenant?.currencyCode) setActiveCurrency(tenant.currencyCode);
        });
    }

    ngOnInit(): void {
        this.network.startWatching();
        this.title.setTitle(this.appTitle);
        this.navSub = this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe(() => {
                this.title.setTitle(this.appTitle);
            });
    }

    ngOnDestroy(): void {
        this.navSub?.unsubscribe();
        this.network.stopWatching();
    }
}
