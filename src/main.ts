import { Injector, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { App } from './app/app';
import { routes } from './app/app.routes';
import { AuthService } from './app/core/services/auth.service';
import { PushFeedService } from './app/core/services/push-feed.service';
import { StandupService } from './app/core/services/standup.service';

bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    // Who is logged in, before the first page (the route guards need it). Then, only when logged in, the live data:
    // real pushes from Ascrum and my saved plans, not awaited so the page opens straight away.
    // Logging in or out reloads the page, so these always start for the right member.
    provideAppInitializer(async () => {
      const injector = inject(Injector);
      const auth = inject(AuthService);
      await auth.check();
      if (auth.member()) {
        void injector.get(PushFeedService).connect();
        void injector.get(StandupService).connect();
      }
    })
  ]
}).catch(err => console.error(err));
