import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Interfaccia ColumnConfig */
export interface ColumnConfig {
  /** Proprietà key */
    key: string;
  /** Proprietà label */
    label: string;
  /** Proprietà selected */
    selected: boolean;
}

/** Componente/Servizio TableConfigService */
@Injectable({
  providedIn: 'root'
})
export class TableConfigService {

  /** Proprietà HOSTS_CONFIG_KEY */
    private readonly HOSTS_CONFIG_KEY = 'covenant_table_config_hosts';
  /** Proprietà FIXES_CONFIG_KEY */
    private readonly FIXES_CONFIG_KEY = 'covenant_table_config_fixes';

  /** Proprietà defaultHostsCols */
    private readonly defaultHostsCols: ColumnConfig[] = [
    { key: 'hostname', label: 'Server', selected: true },
    { key: 'applicazione', label: 'Applicazione', selected: true },
    { key: 'os', label: 'Sistema Operativo', selected: true },
    { key: 'ambiente', label: 'Ambiente', selected: true },
    { key: 'servizio', label: 'Servizio', selected: true },
    { key: 'nodo', label: 'Nodo', selected: true },
    { key: 'fixed', label: 'Status FIX', selected: false },
    { key: 'manutenzione', label: 'Finestra manutenzione', selected: false },
    { key: 'locazione', label: 'Locazione', selected: false },
    { key: 'zona', label: 'Zona', selected: false },
    { key: 'company', label: 'Compagnia', selected: false },
    { key: 'riferimento', label: 'Riferimento', selected: false },
    { key: 'riferimentoEs', label: 'Rif. ES', selected: false },
    { key: 'pianificazione', label: 'Pianificazione', selected: false },
    { key: 'fixable', label: 'Fixable', selected: false },
    { key: 'appliance', label: 'Appliance', selected: false },
    { key: 'divisione', label: 'Divisione', selected: false },
    { key: 'rfc', label: 'RFC', selected: false },
    { key: 'status', label: 'Status', selected: false }
  ];

  /** Proprietà defaultFixesCols */
    private readonly defaultFixesCols: ColumnConfig[] = [
    { key: 'hostname', label: 'Server', selected: true },
    { key: 'applicazione', label: 'Applicazione', selected: true },
    { key: 'os', label: 'Sistema Operativo', selected: true },
    { key: 'ambiente', label: 'Ambiente', selected: true },
    { key: 'servizio', label: 'Servizio', selected: false },
    { key: 'nodo', label: 'Nodo', selected: true },
    { key: 'fixed', label: 'Status FIX', selected: true },
    { key: 'manutenzione', label: 'Finestra manutenzione', selected: true },
    { key: 'locazione', label: 'Locazione', selected: false },
    { key: 'zona', label: 'Zona', selected: false },
    { key: 'company', label: 'Compagnia', selected: false },
    { key: 'riferimento', label: 'Riferimento', selected: false },
    { key: 'riferimentoEs', label: 'Rif. ES', selected: false },
    { key: 'pianificazione', label: 'Pianificazione', selected: false },
    { key: 'fixable', label: 'Fixable', selected: false },
    { key: 'appliance', label: 'Appliance', selected: false },
    { key: 'divisione', label: 'Divisione', selected: false },
    { key: 'rfc', label: 'RFC', selected: false },
    { key: 'status', label: 'Status', selected: false }
  ];

  /** Proprietà hostsColsSubject */
    private readonly hostsColsSubject = new BehaviorSubject<ColumnConfig[]>(this.loadConfig(this.HOSTS_CONFIG_KEY, this.defaultHostsCols));
  /** Proprietà fixesColsSubject */
    private readonly fixesColsSubject = new BehaviorSubject<ColumnConfig[]>(this.loadConfig(this.FIXES_CONFIG_KEY, this.defaultFixesCols));

  /** Proprietà hostsCols$ */
    hostsCols$ = this.hostsColsSubject.asObservable();
  /** Proprietà fixesCols$ */
    fixesCols$ = this.fixesColsSubject.asObservable();

  /** Costruttore di TableConfigService */
    constructor() { }

  /** Metodo loadConfig */
    private loadConfig(key: string, defaults: ColumnConfig[]): ColumnConfig[] {
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If we detect deprecated keys like 'ipFrontend' or old labels, force reset
        if (parsed.some((c: any) => c.key === 'ipFrontend' || c.key === 'compagnia' || (c.key === 'hostname' && c.label === 'Hostname'))) {
          localStorage.removeItem(key);
          return [...defaults];
        }

        return defaults.map(def => {
          const found = parsed.find((p: any) => p.key === def.key);
          return found ?? def;
        });
      } catch {
        return [...defaults];
      }
    }
    return [...defaults];
  }

  /** Metodo saveHostsConfig */
    saveHostsConfig(config: ColumnConfig[]) {
    localStorage.setItem(this.HOSTS_CONFIG_KEY, JSON.stringify(config));
    this.hostsColsSubject.next(config);
  }

  /** Metodo saveFixesConfig */
    saveFixesConfig(config: ColumnConfig[]) {
    localStorage.setItem(this.FIXES_CONFIG_KEY, JSON.stringify(config));
    this.fixesColsSubject.next(config);
  }
}
