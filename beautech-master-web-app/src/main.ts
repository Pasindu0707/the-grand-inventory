import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import {AppComponent} from "@/app.component";
import {appConfig} from "@/app.config";


bootstrapApplication(AppComponent, {
    providers: [
        provideAnimations(),
        ...appConfig.providers
    ]
});
