import { Routes } from '@angular/router';
import { DesignSystemSamplesComponent } from './design-system-samples.component';

export const sampleUiRoutes: Routes = [
    {
        path: '',
        component: DesignSystemSamplesComponent,
        title: 'Design system — samples'
    }
];
