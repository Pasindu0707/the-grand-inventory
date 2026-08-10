/**
 * Keyboard-wedge barcode scanner — intercepts fast keystroke bursts from USB/BT
 * scanners. Ported from FRONTEND_DOCUMENTATION.md §6.1 (useBarcodeScanner).
 */
import { Directive, EventEmitter, Input, Output, OnInit, OnDestroy, inject } from '@angular/core';
import { db } from './pos-database';
import { CartStore } from '../stores/cart.store';

@Directive({
    selector: '[posBarcodeScanner]',
    standalone: true
})
export class BarcodeScannerDirective implements OnInit, OnDestroy {
    @Input() maxKeyIntervalMs = 30;
    @Input() minLength = 4;
    @Input() scannerEnabled = true;
    @Output() scan = new EventEmitter<{ code: string; matched: boolean }>();

    private cart = inject(CartStore);
    private buffer = '';
    private lastTime = 0;

    ngOnInit(): void {
        window.addEventListener('keydown', this.handler, true);
    }

    ngOnDestroy(): void {
        window.removeEventListener('keydown', this.handler, true);
    }

    private handler = (e: KeyboardEvent): void => {
        if (!this.scannerEnabled) return;

        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;

        if (e.key === 'Enter') {
            if (this.buffer.length >= this.minLength) {
                e.preventDefault();
                void this.process(this.buffer);
            }
            this.buffer = '';
            return;
        }

        // Only single printable characters
        if (e.key.length !== 1) return;

        if (delta < this.maxKeyIntervalMs || this.buffer.length === 0) {
            this.buffer += e.key;
            if (this.buffer.length > 1) {
                e.preventDefault(); // suppress input into focused fields once we suspect a scan
            }
        } else {
            // Human-speed gap → restart buffer
            this.buffer = e.key;
        }
    };

    private async process(code: string): Promise<void> {
        const product = await db.products.where('sku').equals(code).first();
        if (product) {
            this.cart.addProduct(product);
        }
        this.scan.emit({ code, matched: !!product });
        this.buffer = '';
    }
}
