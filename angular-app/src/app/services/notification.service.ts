import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface AppNotification {
    id: string;
    type: NotificationType;
    message: string;
    resource: string;
    action: string;
    timestamp: string;
    actor: string;
}

export interface Toast {
    id: string;
    type: NotificationType;
    message: string;
    dismissing: boolean;
}

const TOKEN_KEY = 'covenant_auth_token';
const LAST_SEEN_KEY = 'covenant_notif_last_seen';

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);
    private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
    private readonly unreadCountSubject = new BehaviorSubject<number>(0);

    readonly toasts$ = this.toastsSubject.asObservable();
    readonly notifications$ = this.notificationsSubject.asObservable();
    readonly unreadCount$ = this.unreadCountSubject.asObservable();

    private eventSource: EventSource | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly auth: AuthService) {
        this.auth.currentUser$.subscribe(user => {
            if (user) {
                this.connectSse();
                this.fetchMissed();
            } else {
                this.disconnectSse();
                this.notificationsSubject.next([]);
                this.unreadCountSubject.next(0);
            }
        });
    }

    private connectSse(): void {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        if (this.eventSource) this.disconnectSse();

        const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
        this.eventSource = new EventSource(url);

        this.eventSource.onmessage = (event: MessageEvent) => {
            try {
                const notification: AppNotification = JSON.parse(event.data);
                this.handleIncoming(notification);
            } catch { /* ignore malformed events */ }
        };

        this.eventSource.onerror = () => {
            this.eventSource?.close();
            this.eventSource = null;
            this.reconnectTimer = setTimeout(() => this.connectSse(), 5000);
        };
    }

    private disconnectSse(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.eventSource?.close();
        this.eventSource = null;
    }

    private async fetchMissed(): Promise<void> {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;

        const since = localStorage.getItem(LAST_SEEN_KEY);
        const url = since
            ? `/api/notifications?since=${encodeURIComponent(since)}`
            : '/api/notifications';

        try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;

            const notifications: AppNotification[] = await res.json();
            const currentIds = new Set(this.notificationsSubject.value.map(n => n.id));
            const newOnes = notifications
                .filter(n => !currentIds.has(n.id))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if (newOnes.length > 0) {
                this.notificationsSubject.next([...newOnes, ...this.notificationsSubject.value]);
                this.unreadCountSubject.next(this.unreadCountSubject.value + newOnes.length);
            }
        } catch { /* ignore fetch errors */ }

        localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }

    private handleIncoming(notification: AppNotification): void {
        const currentUser = this.auth.getCurrentUser()?.username;

        const current = this.notificationsSubject.value;
        if (!current.some(n => n.id === notification.id)) {
            this.notificationsSubject.next([notification, ...current]);
        }

        // Toast and unread badge only for other users' actions
        if (notification.actor !== currentUser) {
            this.showToast({ type: notification.type, message: notification.message });
            this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
        }
    }

    showToast(opts: { type: NotificationType; message: string }): void {
        const id = crypto.randomUUID();
        const toast: Toast = { ...opts, id, dismissing: false };
        this.toastsSubject.next([...this.toastsSubject.value, toast]);

        // Start dismiss animation at 2.7s, remove at 3s
        setTimeout(() => {
            this.toastsSubject.next(
                this.toastsSubject.value.map(t => t.id === id ? { ...t, dismissing: true } : t)
            );
            setTimeout(() => this.removeToast(id), 300);
        }, 2700);
    }

    removeToast(id: string): void {
        this.toastsSubject.next(this.toastsSubject.value.filter(t => t.id !== id));
    }

    markAllRead(): void {
        this.unreadCountSubject.next(0);
        localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }

    clearAll(): void {
        this.notificationsSubject.next([]);
        this.unreadCountSubject.next(0);
        localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }
}
