import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { HeaderComponent } from './components/header/header.component';
import { ToastComponent } from './components/toast/toast.component';
import { filter } from 'rxjs';

/** Componente/Servizio AppComponent */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  /** Proprietà title */
    title = 'Covenant';
  /** Proprietà isLoginRoute */
    isLoginRoute = false;

  /** Costruttore di AppComponent */
    constructor(private readonly router: Router) {
    this.isLoginRoute = this.router.url.startsWith('/login');

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.isLoginRoute = event.urlAfterRedirects.startsWith('/login');
      });
  }
}
