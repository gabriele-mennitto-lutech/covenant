import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Toast } from '../../services/notification.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './toast.component.html',
    styleUrl: './toast.component.css'
})
export class ToastComponent {
    private readonly notif = inject(NotificationService);
    readonly toasts$ = this.notif.toasts$;

    trackById(_: number, t: Toast): string {
        return t.id;
    }

    dismiss(id: string): void {
        this.notif.removeToast(id);
    }

    getIcon(type: Toast['type']): string {
        switch (type) {
            case 'success': return 'fa-solid fa-circle-check';
            case 'error':   return 'fa-solid fa-circle-xmark';
            case 'warning': return 'fa-solid fa-triangle-exclamation';
            case 'info':    return 'fa-solid fa-circle-info';
        }
    }
}
