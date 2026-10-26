import { Component, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { NotificationService, AppNotification } from '../../services/notification.service';

/** Componente/Servizio HeaderComponent */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  /** Proprietà isUserMenuOpen */
    isUserMenuOpen = false;
  /** Proprietà isNotifOpen */
    isNotifOpen = false;

  /** Costruttore di HeaderComponent */
    constructor(
    public readonly auth: AuthService,
    public readonly notif: NotificationService,
    private readonly eRef: ElementRef
  ) {}

  /** Metodo toggleUserMenu */
    toggleUserMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
    if (this.isUserMenuOpen) this.isNotifOpen = false;
  }

  /** Metodo toggleNotifications */
    toggleNotifications(event?: Event) {
    if (event) event.stopPropagation();
    this.isNotifOpen = !this.isNotifOpen;
    if (this.isNotifOpen) {
      this.isUserMenuOpen = false;
      this.notif.markAllRead();
    }
  }

  /** Metodo clickout */
    @HostListener('document:click', ['$event'])
  clickout(event: Event) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.isUserMenuOpen = false;
      this.isNotifOpen = false;
    }
  }

  /** Metodo logout */
    async logout() {
    this.isUserMenuOpen = false;
    await this.auth.logout(true);
  }

  get userInitials(): string {
    const user = this.auth.getCurrentUser();
    if (!user?.username) return 'U';
    return user.username.substring(0, 2).toUpperCase();
  }

  getNotifIcon(notification: AppNotification): string {
    switch (notification.resource) {
      case 'host': return 'fa-solid fa-server';
      case 'site': return 'fa-solid fa-globe';
      case 'service': return 'fa-solid fa-layer-group';
      case 'template': return 'fa-solid fa-envelope';
      default: return 'fa-solid fa-bell';
    }
  }

  getNotifTypeClass(notification: AppNotification): string {
    return `notif-type-${notification.type}`;
  }

  formatTime(timestamp: string): string {
    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'adesso';
    if (diffMin < 60) return `${diffMin}m fa`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h fa`;
    return d.toLocaleDateString('it-IT');
  }

  trackById(_: number, n: AppNotification): string {
    return n.id;
  }

  clearAll(): void {
    this.notif.clearAll();
  }
}


