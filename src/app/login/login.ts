import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService, afterLoginUrl } from '../core/services/auth.service';

type Mode = 'login' | 'signup';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly mode = signal<Mode>('login');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set('');
  }

  protected async submit(email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const error = this.mode() === 'login' ? await this.auth.logIn(email, password) : await this.auth.signUp(email, password);
    if (error) {
      this.error.set(error);
      this.busy.set(false);
      return;
    }
    // A fresh page: the app then starts its live data (pushes, saved plans) for this member (main.ts).
    location.assign(afterLoginUrl(this.route.snapshot.queryParamMap.get('next')));
  }
}
