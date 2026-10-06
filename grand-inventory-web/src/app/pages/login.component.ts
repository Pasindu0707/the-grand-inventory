/**
 * Sign in on a shared device.
 *
 * The branch comes from the link - /login/gb, /login/esp - so nobody standing
 * in the Gastrobar is ever asked where they are. Pick where you work, tap your
 * name, key in a PIN. Nobody types an email address on a wet tablet in a store
 * room with a delivery waiting, which is why the schema stores a PIN and not a
 * password.
 *
 * Three steps down one column rather than a form: on a shared tablet the
 * question is never "what are your credentials", it is "which of these five
 * people are you", and a list of names answers that in one tap.
 */
import { Component, HostListener, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@/core/auth.store';
import { GrandService } from '@/core/grand.service';
import { NotifyService } from '@/core/notify.service';
import { apiErrorMessage } from '@/core/api';
import { ROLE_LABELS, type BootstrapResponse, type LocationRef, type Role } from '@/core/types';

interface Tile {
    id: number;
    name: string;
    role: Role;
    locationId: number | null;
    sectionId: number | null;
}

/**
 * One way in: a section people work in, or a role that runs the whole branch.
 *
 * Kitchens and cleaning are doors by section, because the hot kitchen and the
 * pastry kitchen are different shelves with different people. Management, the
 * storekeeper and the admin stand at no one shelf, so their door is the role.
 */
interface Door {
    key: string;
    label: string;
    hint: string;
    people: Tile[];
}

/** Where the last branch this device signed in at is kept, for bare /login. */
const BRANCH_KEY = 'grand.branch';

function rememberedBranch(): string | null {
    try {
        return localStorage.getItem(BRANCH_KEY);
    } catch {
        return null;
    }
}

function rememberBranch(code: string): void {
    try {
        localStorage.setItem(BRANCH_KEY, code);
    } catch {
        // Private mode or blocked storage: the link still works, it just will
        // not be offered back on a bare /login.
    }
}

@Component({
    selector: 'grand-login',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    styles: [
        `
            .signin {
                display: grid;
                grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
                min-height: 100vh;
                background: var(--g-paper);
            }

            /* The ink half carries the one thing worth saying about this system
               before anybody has signed in to it. */
            .signin__ink {
                position: relative;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 40px;
                background: var(--g-ink);
                color: #fff;
                overflow: hidden;
            }

            .signin__brand {
                display: flex;
                align-items: center;
                gap: 13px;
            }
            .signin__mark {
                width: 4px;
                height: 34px;
                background: var(--g-brass);
            }
            .signin__wordmark {
                font-size: 21px;
                font-weight: 700;
                letter-spacing: -0.025em;
                line-height: 1.05;
            }
            .signin__kicker {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.22em;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.42);
            }

            .signin__thesis {
                max-width: 30ch;
                font-size: 27px;
                font-weight: 600;
                line-height: 1.24;
                letter-spacing: -0.03em;
            }
            .signin__thesis em {
                font-style: normal;
                color: var(--g-brass);
            }
            .signin__gloss {
                margin-top: 14px;
                max-width: 42ch;
                font-size: 13.5px;
                line-height: 1.6;
                color: rgba(255, 255, 255, 0.56);
            }

            .signin__foot {
                display: flex;
                gap: 26px;
                font-size: 12px;
                color: rgba(255, 255, 255, 0.4);
            }
            .signin__foot b {
                display: block;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 17px;
                font-weight: 500;
                color: #fff;
            }

            .signin__pane {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 36px 28px;
            }
            .signin__form {
                width: 100%;
                max-width: 380px;
            }

            .step {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.18em;
                text-transform: uppercase;
                color: var(--g-text-3);
            }
            .step__q {
                margin-top: 3px;
                font-size: 22px;
                font-weight: 700;
                letter-spacing: -0.028em;
            }

            /* A ruled list, not a grid of cards: this is a roster. */
            .roster {
                margin-top: 18px;
                border: 1px solid var(--g-rule);
                border-radius: var(--g-radius-lg);
                background: var(--g-card);
                overflow: hidden;
            }
            .roster__row {
                display: flex;
                align-items: center;
                gap: 11px;
                width: 100%;
                padding: 12px 14px;
                text-align: left;
                background: transparent;
                border: 0;
                border-bottom: 1px solid var(--g-rule);
                border-left: 3px solid transparent;
                cursor: pointer;
                color: inherit;
                transition:
                    background-color 0.12s ease,
                    border-left-color 0.12s ease;
            }
            .roster__row:last-child {
                border-bottom: 0;
            }
            .roster__row:hover {
                background: var(--g-card-2);
                border-left-color: var(--g-brass);
            }
            .roster__name {
                font-weight: 600;
                font-size: 14px;
            }
            .roster__meta {
                font-size: 12px;
                color: var(--g-text-2);
            }
            .roster__chevron {
                margin-left: auto;
                color: var(--g-text-3);
                font-size: 12px;
            }

            /* Four cells, filled left to right. A cell is a digit's worth of
               space, so a half-typed PIN reads as unfinished, not as an error. */
            .pin {
                display: flex;
                justify-content: center;
                gap: 9px;
                margin: 20px 0 22px;
            }
            .pin__cell {
                width: 40px;
                height: 48px;
                border: 1px solid var(--g-rule-strong);
                border-radius: var(--g-radius);
                background: var(--g-card);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .pin__cell--on {
                border-color: var(--g-brass);
                background: var(--g-brass-wash);
            }
            .pin__dot {
                width: 9px;
                height: 9px;
                border-radius: 50%;
                background: var(--g-brass-deep);
            }

            .keypad {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
            }
            .key {
                height: 54px;
                border: 1px solid var(--g-rule);
                border-radius: var(--g-radius);
                background: var(--g-card);
                font-family: 'IBM Plex Mono', monospace;
                font-size: 19px;
                font-weight: 500;
                color: var(--g-text);
                cursor: pointer;
                transition:
                    background-color 0.1s ease,
                    border-color 0.1s ease;
            }
            .key:hover:not(:disabled) {
                background: var(--g-card-2);
                border-color: var(--g-rule-strong);
            }
            .key:disabled {
                opacity: 0.5;
                cursor: default;
            }
            /* The pad is the obvious way in; this says the keyboard works too,
               without competing with it for attention. */
            .typehint {
                margin-top: 14px;
                text-align: center;
                font-size: 12px;
                color: var(--g-text-3);
            }

            .key--soft {
                border-color: transparent;
                background: transparent;
                font-family: 'Archivo', system-ui, sans-serif;
                font-size: 13px;
                font-weight: 600;
                color: var(--g-text-2);
            }

            @media (max-width: 900px) {
                .signin {
                    grid-template-columns: 1fr;
                }
                .signin__ink {
                    padding: 24px;
                }
                .signin__thesis,
                .signin__gloss,
                .signin__foot {
                    display: none;
                }
                .signin__pane {
                    padding: 26px 20px 44px;
                }
            }
        `
    ],
    template: `
        <div class="signin">
            <!-- ── The ink half ──────────────────────────────────────────── -->
            <aside class="signin__ink">
                <div class="signin__brand">
                    <span class="signin__mark" aria-hidden="true"></span>
                    <div>
                        <div class="signin__wordmark">The Grand</div>
                        <div class="signin__kicker">{{ branch()?.name ?? 'Inventory' }}</div>
                    </div>
                </div>

                <div>
                    <h1 class="signin__thesis">
                        Every entry is signed.<br />Nothing is <em>edited</em>, nothing is
                        <em>deleted</em>.
                    </h1>
                    <p class="signin__gloss">
                        Deliveries, issues, wastage and counts stack up in one ledger. A mistake is
                        put right by a reversal that stays on the record, so the story of the store
                        can always be read back.
                    </p>
                </div>

                <div class="signin__foot">
                    <div>
                        <b>{{ doors().length || '-' }}</b>
                        Ways in
                    </div>
                    <div>
                        <b>{{ peopleHere() || '-' }}</b>
                        People
                    </div>
                </div>
            </aside>

            <!-- ── The sign-in half ──────────────────────────────────────── -->
            <main class="signin__pane">
                <div class="signin__form">
                    <!-- No branch in the link, and none remembered on this device -->
                    @if (step() === 'nobranch') {
                        <h2 class="step__q">Use your branch's link</h2>
                        <p class="roster__meta mt-2">
                            Each branch signs in from its own address. Ask your manager for the
                            link for your branch, and keep it as a bookmark on this device.
                        </p>
                        @if (unknownBranch()) {
                            <div class="app-note app-note--warn mt-4">
                                <div class="app-note__title">No branch called "{{ unknownBranch() }}"</div>
                                <p class="mt-1">
                                    The link may be mistyped, or the branch has been switched off.
                                </p>
                            </div>
                        }
                    }

                    <!-- Step 1: where do you work -->
                    @if (step() === 'door') {
                        <div class="step">Step 1 of 3</div>
                        <h2 class="step__q">Where do you work?</h2>

                        @if (loading()) {
                            <div class="empty">
                                <div class="empty__rule"></div>
                                <div class="empty__body">Fetching the sections</div>
                            </div>
                        } @else if (loadError()) {
                            <div class="app-note app-note--error mt-4">
                                <div class="app-note__title">Cannot reach the system</div>
                                <p class="mt-1">{{ loadError() }}</p>
                                <button
                                    pButton
                                    class="mt-2"
                                    size="small"
                                    label="Try again"
                                    (click)="loadBootstrap()"
                                ></button>
                            </div>
                        } @else {
                            <div class="roster">
                                @for (door of doors(); track door.key) {
                                    <button
                                        type="button"
                                        class="roster__row"
                                        (click)="pickDoor(door)"
                                    >
                                        <span class="min-w-0">
                                            <span class="roster__name block">{{ door.label }}</span>
                                            <span class="roster__meta">{{ door.hint }}</span>
                                        </span>
                                        <i class="pi pi-angle-right roster__chevron"></i>
                                    </button>
                                }
                            </div>
                        }
                    }

                    <!-- Step 2: who are you -->
                    @if (step() === 'user') {
                        <div class="step">Step 2 of 3</div>
                        <div class="flex items-center justify-between gap-3">
                            <h2 class="step__q">Who are you?</h2>
                            <button
                                pButton
                                text
                                size="small"
                                [label]="'Not ' + selectedDoor()?.label"
                                (click)="step.set('door')"
                            ></button>
                        </div>

                        @if (usersHere().length === 0) {
                            <div class="app-note app-note--warn mt-4">
                                <div class="app-note__title">No logins here yet</div>
                                <p class="mt-1">
                                    Nobody has been given a login for {{ selectedDoor()?.label }}
                                    at {{ branch()?.name }}. An admin adds people under Logins.
                                </p>
                            </div>
                        } @else {
                            <div class="roster">
                                @for (u of usersHere(); track u.id) {
                                    <button type="button" class="roster__row" (click)="pickUser(u)">
                                        <span
                                            class="app-avatar"
                                            style="width:32px;height:32px;flex:0 0 auto"
                                            >{{ initials(u.name) }}</span
                                        >
                                        <span class="min-w-0">
                                            <span class="roster__name block truncate">{{
                                                u.name
                                            }}</span>
                                            <span class="roster__meta">{{
                                                roleLabel(u.role)
                                            }}</span>
                                        </span>
                                        <i class="pi pi-angle-right roster__chevron"></i>
                                    </button>
                                }
                            </div>
                        }
                    }

                    <!-- Step 3: PIN -->
                    @if (step() === 'pin') {
                        <div class="step">Step 3 of 3</div>
                        <h2 class="step__q">Your PIN</h2>

                        <div class="flex items-center gap-2.5 mt-3">
                            <span class="app-avatar" style="width:32px;height:32px">{{
                                initials(selectedUser()!.name)
                            }}</span>
                            <div class="min-w-0">
                                <div class="roster__name truncate">{{ selectedUser()!.name }}</div>
                                <div class="roster__meta">
                                    {{ selectedDoor()?.label }} · {{ branch()?.name }}
                                </div>
                            </div>
                        </div>

                        <div class="pin" role="status" [attr.aria-label]="pinLabel()">
                            @for (i of [0, 1, 2, 3]; track i) {
                                <div class="pin__cell" [class.pin__cell--on]="pin().length > i">
                                    @if (pin().length > i) {
                                        <span class="pin__dot"></span>
                                    }
                                </div>
                            }
                        </div>

                        <div class="keypad">
                            @for (d of digits; track d) {
                                <button
                                    type="button"
                                    class="key"
                                    [disabled]="submitting()"
                                    (click)="press(d)"
                                >
                                    {{ d }}
                                </button>
                            }
                            <button type="button" class="key key--soft" (click)="back()">
                                Back
                            </button>
                            <button
                                type="button"
                                class="key"
                                [disabled]="submitting()"
                                (click)="press('0')"
                            >
                                0
                            </button>
                            <button
                                type="button"
                                class="key key--soft"
                                [disabled]="submitting()"
                                (click)="backspace()"
                            >
                                Delete
                            </button>
                        </div>

                        @if (error()) {
                            <div class="app-note app-note--error mt-4">{{ error() }}</div>
                        } @else if (submitting()) {
                            <p class="text-surface-500 text-sm mt-4 text-center">Signing in…</p>
                        } @else {
                            <p class="typehint">Or type it on the keyboard</p>
                        }
                    }
                </div>
            </main>
        </div>
    `
})
export class LoginComponent implements OnInit {
    private api = inject(GrandService);
    private auth = inject(AuthStore);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private notify = inject(NotifyService);

    readonly digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    readonly step = signal<'nobranch' | 'door' | 'user' | 'pin'>('door');
    readonly loading = signal(false);
    readonly loadError = signal<string | null>(null);
    readonly submitting = signal(false);
    readonly error = signal<string | null>(null);
    readonly pin = signal('');

    /** The code from the link that matched no active branch, to say so. */
    readonly unknownBranch = signal<string | null>(null);
    readonly branch = signal<LocationRef | null>(null);
    private sections = signal<BootstrapResponse['sections']>([]);
    private allUsers = signal<Tile[]>([]);
    readonly selectedDoor = signal<Door | null>(null);
    readonly selectedUser = signal<Tile | null>(null);

    /** Branch staff plus group-wide roles, who can sign in anywhere. */
    private branchUsers = computed(() => {
        const locId = this.branch()?.id;
        return this.allUsers().filter((u) => u.locationId === locId || u.locationId === null);
    });

    readonly peopleHere = computed(() => this.branchUsers().length);

    /**
     * Sections first, kitchens before cleaning and by name within a kind, then
     * the three roles that run the branch.
     *
     * A kitchen or cleaning login nobody has placed in a section yet shows
     * behind every door of its kind rather than behind none: locking someone
     * out of the morning's request because setup is unfinished helps nobody.
     */
    readonly doors = computed<Door[]>(() => {
        const locId = this.branch()?.id;
        const people = this.branchUsers();
        const kindRole: Record<string, Role> = { KITCHEN: 'kitchen', CLEAN: 'cleaning' };
        const kindOrder = ['KITCHEN', 'CLEAN'];

        const sectionDoors = this.sections()
            .filter((s) => s.locationId === locId && kindRole[s.kind])
            // Front of house before the kitchens behind it: Restaurant, then
            // Hot Kitchen and Pastry Kitchen, which is the way people walk in.
            .sort(
                (a, b) =>
                    kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
                    Number(/kitchen/i.test(a.name)) - Number(/kitchen/i.test(b.name)) ||
                    a.name.localeCompare(b.name)
            )
            .map((s) =>
                this.door(
                    `s${s.id}`,
                    s.name,
                    people.filter(
                        (u) =>
                            u.role === kindRole[s.kind] &&
                            (u.sectionId === s.id || u.sectionId === null)
                    )
                )
            );

        const roleDoors = (
            [
                ['management', 'Main'],
                ['storekeeper', 'Storekeeper'],
                ['admin', 'Admin']
            ] as const
        ).map(([role, label]) =>
            this.door(
                role,
                label,
                people.filter((u) => u.role === role)
            )
        );

        return [...sectionDoors, ...roleDoors];
    });

    readonly usersHere = computed(() => this.selectedDoor()?.people ?? []);

    /** The dots are decorative; this is what a screen reader gets instead. */
    readonly pinLabel = computed(() => `${this.pin().length} of 4 digits entered`);

    ngOnInit(): void {
        // Bare /login - after signing out, or an expired session - goes back to
        // the branch this device last used, so the tablet stays its branch's.
        if (!this.route.snapshot.paramMap.get('branch')) {
            const last = rememberedBranch();
            if (last) {
                void this.router.navigate(['/login', last], { replaceUrl: true });
                return;
            }
            this.step.set('nobranch');
            return;
        }
        void this.loadBootstrap();
    }

    async loadBootstrap(): Promise<void> {
        const code = (this.route.snapshot.paramMap.get('branch') ?? '').toLowerCase();
        this.loading.set(true);
        this.loadError.set(null);
        try {
            const data = await this.api.bootstrap();
            const branch = data.locations.find((l) => l.code.toLowerCase() === code);
            if (!branch) {
                this.unknownBranch.set(code);
                this.step.set('nobranch');
                return;
            }
            rememberBranch(code);
            this.branch.set(branch);
            this.sections.set(data.sections);
            this.allUsers.set(data.users);
        } catch (err) {
            this.loadError.set(apiErrorMessage(err));
        } finally {
            this.loading.set(false);
        }
    }

    pickDoor(door: Door): void {
        this.selectedDoor.set(door);
        this.step.set('user');
    }

    private door(key: string, label: string, people: Tile[]): Door {
        const n = people.length;
        const hint =
            n === 0 ? 'No logins yet' : n === 1 ? people[0].name : `${n} people`;
        return { key, label, hint, people };
    }

    pickUser(user: Tile): void {
        this.selectedUser.set(user);
        this.pin.set('');
        this.error.set(null);
        this.step.set('pin');
    }

    back(): void {
        this.pin.set('');
        this.error.set(null);
        this.step.set('user');
    }

    backspace(): void {
        this.pin.update((p) => p.slice(0, -1));
        this.error.set(null);
    }

    press(digit: string): void {
        if (this.pin().length >= 4) return;
        this.pin.update((p) => p + digit);
        this.error.set(null);
        if (this.pin().length === 4) void this.submit();
    }

    /**
     * The keypad is for the tablet by the door; the keyboard is for the office.
     *
     * Bound on the document rather than on a hidden input, because there is no
     * field here to put a caret in - the four cells are the display, not a
     * control - and asking the manager at a desk to click the pad before they
     * can type would be the whole complaint again.
     *
     * Backspace has to be swallowed: on a page with nothing focused, some
     * browsers still read it as "go back", which would throw away the outlet
     * and the name that were already chosen.
     */
    @HostListener('document:keydown', ['$event'])
    onKeydown(event: KeyboardEvent): void {
        if (this.step() !== 'pin') return;
        // Leave shortcuts alone - Ctrl+R is a reload, not a digit.
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (/^[0-9]$/.test(event.key)) {
            if (this.submitting()) return;
            event.preventDefault();
            this.press(event.key);
            return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            if (!this.submitting()) this.backspace();
            return;
        }

        // Away from the PIN, back to the roster: the same thing the Back key
        // on the pad does, and the gesture people already have for "not me".
        if (event.key === 'Escape') {
            event.preventDefault();
            this.back();
        }
    }

    private async submit(): Promise<void> {
        const user = this.selectedUser();
        const loc = this.branch();
        if (!user || !loc) return;

        this.submitting.set(true);
        try {
            const session = await this.api.login(user.id, loc.id, this.pin());
            this.auth.setSession(session);
            this.notify.success(`Welcome, ${session.user.name}`);
            await this.router.navigate(['/home']);
        } catch (err) {
            this.error.set(apiErrorMessage(err));
            this.pin.set('');
        } finally {
            this.submitting.set(false);
        }
    }

    initials(name: string): string {
        return name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '')
            .join('');
    }

    roleLabel(role: Role): string {
        return ROLE_LABELS[role] ?? role;
    }
}
