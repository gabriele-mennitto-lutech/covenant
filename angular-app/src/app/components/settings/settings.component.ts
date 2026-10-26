import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableConfigService, ColumnConfig } from '../../services/table-config.service';
import { Subscription } from 'rxjs';
import { InputSwitchModule } from 'primeng/inputswitch';
import { BackendService } from '../../services/backend.service';
import { AuthService } from '../../services/auth.service';

/** Componente/Servizio SettingsComponent */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, InputSwitchModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
  /** Proprietà hostsCols */
    hostsCols: ColumnConfig[] = [];
  /** Proprietà fixesCols */
    fixesCols: ColumnConfig[] = [];
  
  /** Proprietà subs */
    private subs: Subscription = new Subscription();

  // Dynamic Settings
  /** Proprietà globalSettings */
    globalSettings: any = {};
  /** Proprietà isSavingGlobal */
    isSavingGlobal = false;
  /** Proprietà globalSaveMessage */
    globalSaveMessage = '';

  /** Proprietà activityLogs */
    activityLogs: any[] = [];

  /** Costruttore di SettingsComponent */
    constructor(private readonly configService: TableConfigService, private readonly backend: BackendService, public readonly auth: AuthService) {}

  get canWrite(): boolean {
    return this.auth.canWrite();
  }

  /** Lifecycle hook ngOnInit */
    ngOnInit() {
    this.loadGlobalSettings();
    this.loadActivityLogs();
    this.subs.add(this.configService.hostsCols$.subscribe(cols => {
      // Create a deep copy to avoid modifying the service state directly before saving
      this.hostsCols = cols.map(c => ({...c}));
    }));

    this.subs.add(this.configService.fixesCols$.subscribe(cols => {
      this.fixesCols = cols.map(c => ({...c}));
    }));
  }

  /** Lifecycle hook ngOnDestroy */
    ngOnDestroy() {
    this.subs.unsubscribe();
  }

  /** Metodo loadGlobalSettings */
    async loadGlobalSettings() {
    try {
      this.globalSettings = { ...await this.backend.getSettings(), theme: 'light' };
    } catch (e) {
      console.error('Failed to load global settings', e);
    }
  }

  /** Metodo loadActivityLogs */
    async loadActivityLogs() {
    try {
      // Load latest 100 logs
      const res = await this.backend.getActivityLogs(1, 100);
      this.activityLogs = res.items || [];
    } catch (e) {
      console.error('Failed to load activity logs', e);
    }
  }

  /** Metodo saveGlobalSettings */
    async saveGlobalSettings() {
    if (!this.canWrite) return;
    this.isSavingGlobal = true;
    this.globalSaveMessage = '';
    try {
      await this.backend.updateSettings(this.globalSettings);
      this.globalSaveMessage = 'Impostazioni salvate con successo.';
      
      // Optionally notify other services if needed
      setTimeout(() => this.globalSaveMessage = '', 3000);
    } catch (e) {
      this.globalSaveMessage = 'Errore durante il salvataggio.';
      console.error('Failed to save settings', e);
    } finally {
      this.isSavingGlobal = false;
    }
  }

  /** Metodo saveHostsConfig */
    saveHostsConfig() {
    if (!this.canWrite) return;
    this.configService.saveHostsConfig(this.hostsCols);
    // You could add a small toast notification here
  }

  /** Metodo saveFixesConfig */
    saveFixesConfig() {
    if (!this.canWrite) return;
    this.configService.saveFixesConfig(this.fixesCols);
  }

  /** Metodo openBackendDocs */
    openBackendDocs() {
    window.open('http://localhost:9991/api-docs', '_blank', 'noopener,noreferrer');
  }

  /** Metodo openFrontendDocs */
    openFrontendDocs() {
    window.open('http://localhost:9991/fe-docs', '_blank', 'noopener,noreferrer');
  }

  /** Metodo openDataserviceDocs */
    openDataserviceDocs() {
    window.open('http://localhost:9992/docs', '_blank', 'noopener,noreferrer');
  }

  /** Metodo formatDate */
    formatDate(isoString: string): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /** Metodo getActionIcon */
    getActionIcon(action: string): string {
    switch (action?.toUpperCase()) {
      case 'LOGIN': return 'fas fa-sign-in-alt text-success';
      case 'LOGOUT': return 'fas fa-sign-out-alt text-secondary';
      case 'CREATE': return 'fas fa-plus-circle text-primary';
      case 'UPDATE': return 'fas fa-edit text-warning';
      case 'UPDATE_BULK': return 'fas fa-layer-group text-warning';
      case 'DELETE': return 'fas fa-trash-alt text-danger';
      case 'DELETE_BULK': return 'fas fa-dumpster text-danger';
      default: return 'fas fa-info-circle text-info';
    }
  }
}
