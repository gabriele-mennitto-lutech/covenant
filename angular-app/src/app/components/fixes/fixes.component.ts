import { Component, OnInit, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BackendService, Host } from '../../services/backend.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';
import { SharedTableComponent } from '../shared-table/shared-table.component';
import { GlobalFiltersComponent } from '../global-filters/global-filters.component';
import { InputSwitchModule } from 'primeng/inputswitch';
import { AuthService } from '../../services/auth.service';

/** Componente/Servizio FixesComponent */
@Component({
  selector: 'app-fixes',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedTableComponent, GlobalFiltersComponent, InputSwitchModule],
  templateUrl: './fixes.component.html',
  styleUrl: './fixes.component.css'
})
export class FixesComponent implements OnInit {
  /** Proprietà fixesTables */
    @ViewChildren(SharedTableComponent) readonly fixesTables!: QueryList<SharedTableComponent>;
  /** Proprietà divisions */
    readonly divisions = [
    { name: 'Scheduled Pari', filter: { divisione: 'Scheduled-Pari', fixable: true } },
    { name: 'Scheduled Dispari', filter: { divisione: 'Scheduled-Dispari', fixable: true } },
    { name: 'Manuali', filter: { divisione: 'Manuale', fixable: true } },
    { name: 'Manuali NOC', filter: { divisione: 'Manuale NOC', fixable: true } }
  ];
  /** Proprietà activeDivisions */
    activeDivisions: any[] = [];

  /** Proprietà hosts */
    hosts: Host[] = []; // Not used for rendering anymore, but might be fetched for export
  /** Proprietà baseFilters */
    baseFilters: any = {};
  /** Proprietà isLoading */
    isLoading = false;

  /** Proprietà filterAmbiente */
    filterAmbiente: string[] = ['sviluppo', 'collaudo', 'produzione'];
  /** Proprietà filterLocazione */
    filterLocazione: string[] = [];
  /** Proprietà filterNodo */
    filterNodo: string[] = [];
  /** Proprietà filterStatus */
    filterStatus: string[] = [];
  /** Proprietà filterZona */
    filterZona: string[] = [];
  /** Proprietà filterOSFamily */
    filterOSFamily: string[] = [];
  /** Proprietà filterOS */
    filterOS: string[] = [];
  /** Proprietà availableOS */
    availableOS: string[] = [];
  /** Proprietà filtersCollapsed */
    filtersCollapsed = true;

  /** Proprietà showExportModal */
    showExportModal = false;
  /** Proprietà exportColumns */
    readonly exportColumns = [
    { key: 'hostname', label: 'Hostname', selected: true },
    { key: 'applicazione', label: 'Applicazione', selected: true },
    { key: 'riferimento', label: 'Riferimento', selected: false },
    { key: 'ambiente', label: 'Ambiente', selected: true },
    { key: 'company', label: 'Company', selected: false },
    { key: 'servizio', label: 'Servizio', selected: false },
    { key: 'appliance', label: 'Appliance', selected: false },
    { key: 'zona', label: 'Zona', selected: false },
    { key: 'riferimentoEs', label: 'Riferimento ES', selected: false },
    { key: 'locazione', label: 'Locazione', selected: false },
    { key: 'os', label: 'OS', selected: true },
    { key: 'manutenzione', label: 'Manutenzione', selected: true },
    { key: 'status', label: 'Status', selected: true },
    { key: 'nodo', label: 'Nodo', selected: true },
    { key: 'note', label: 'Note', selected: false },
    { key: 'pianificazione', label: 'Pianificazione', selected: false },
    { key: 'rfc', label: 'RFC', selected: false },
    { key: 'fixed', label: 'Fixed', selected: false },
    { key: 'fixable', label: 'Fixable', selected: false },
    { key: 'divisione', label: 'Divisione', selected: false },
    { key: 'ipfe', label: 'IP Frontend', selected: false },
    { key: 'ipmgt', label: 'IP Management', selected: false },
    { key: 'ipfe2al', label: 'IP FE2AL', selected: false },
    { key: 'vlfe', label: 'VLAN Frontend', selected: false },
    { key: 'vlmgt', label: 'VLAN Management', selected: false },
    { key: 'vlfe2al', label: 'VLAN FE2AL', selected: false }
  ];

  /** Proprietà sub */
    private sub!: Subscription;

  /** Proprietà selectionsByDivision */
    selectionsByDivision: { [key: string]: Host[] } = {};

  get selectedHosts(): Host[] {
      let all: Host[] = [];
      for (const key of Object.keys(this.selectionsByDivision)) {
          all = all.concat(this.selectionsByDivision[key]);
      }
      return all;
  }

  /** Costruttore di FixesComponent */
    constructor(private readonly backend: BackendService, public readonly auth: AuthService, private readonly notif: NotificationService) {}

  get canWrite(): boolean {
    return this.auth.canWrite();
  }

  /** Proprietà animateFilters */
    animateFilters = false;

  /** Metodo toggleFilters */
    toggleFilters() {
    this.animateFilters = true;
    this.filtersCollapsed = !this.filtersCollapsed;
  }

  /** Lifecycle hook ngOnInit */
    ngOnInit() {
    this.backend.getHosts({ pageSize: -1 }).then(res => {
      const sanitized = res.items.filter(h => 
          !(h.manutenzione || '').toLowerCase().includes('non da aggiornare')
        ).map(h => {
          if ((h.manutenzione || '').toLowerCase().includes('concordare')) {
            h.manutenzione = 'Concordare';
          }
          return h;
        });

      const osSet = new Set(sanitized.map(h => h.os).filter(os => os && os !== '-'));
      this.availableOS = (Array.from(osSet) as string[]).sort((a, b) => a.localeCompare(b));
      
    }).catch(err => console.error(err));
    this.applyGlobalFilters();
  }

  /** Proprietà currentAvailableOSVersions */
    currentAvailableOSVersions: string[] = [];

  private toggleFilterValue(filters: string[], value: string): void {
    const idx = filters.indexOf(value);
    if (idx > -1) {
      filters.splice(idx, 1);
      return;
    }
    filters.push(value);
  }

  /** Metodo getAvailableOSVersions */
    getAvailableOSVersions(): string[] {
    if (this.filterOSFamily.length === 0) return [];
    return this.availableOS.filter(os => {
      const osl = os.toLowerCase();
      return this.filterOSFamily.some(f => {
        if (f === 'Windows') return /^windows (10|11)(?:\b|$)/.test(osl);
        if (f === 'Windows Server') return /^windows server (2016|2019|2022|2025)(?:\b|$)/.test(osl);
        return false;
      });
    });
  }

  /** Metodo updateAvailableOSVersions */
    updateAvailableOSVersions() {
    this.currentAvailableOSVersions = this.getAvailableOSVersions();
  }

  /** Metodo applyGlobalFilters */
    applyGlobalFilters() {
    this.updateAvailableOSVersions();
    
    const base: any = {};
    if (this.filterAmbiente.length > 0) base.ambiente = this.filterAmbiente.join(',');
    else base.ambiente = '__none__'; // If user unchecks all default environments, show none

    if (this.filterNodo.length > 0) base.nodo = this.filterNodo.join(',');
    if (this.filterLocazione.length > 0) base.locazione = this.filterLocazione.join(',');
    if (this.filterStatus.length > 0) base.fixed = this.filterStatus.join(',');
    if (this.filterZona.length > 0) base.zona = this.filterZona.join(',');
    
    if (this.filterOSFamily.length > 0) base.osFamily = this.filterOSFamily.join(',');
    if (this.filterOS.length > 0) base.os = this.filterOS.join(',');

    // exclude 'non da aggiornare' - the backend would need to support excludeManutenzione,
    // or we just send it as a base filter
    base.excludeManutenzione = 'non da aggiornare';

    this.baseFilters = base;
    this.activeDivisions = this.divisions.map(div => ({
        ...div,
        combinedFilter: { ...base, ...div.filter }
    }));
  }

  /** Metodo setPreset */
    setPreset(col: string, val: string) {
    const filterMap: Record<string, string[]> = {
      ambiente: this.filterAmbiente,
      nodo: this.filterNodo,
      locazione: this.filterLocazione,
      status: this.filterStatus,
      zona: this.filterZona,
      os: this.filterOS,
      osFamily: this.filterOSFamily
    };

    const target = filterMap[col];
    if (!target) return;

    this.toggleFilterValue(target, val);

    if (col === 'osFamily') {
      this.updateAvailableOSVersions();
      const validVersions = this.currentAvailableOSVersions;
      this.filterOS = this.filterOS.filter(v => validVersions.includes(v));
    }
    this.applyGlobalFilters();
  }

  /** Metodo setExclusiveEnv */
    setExclusiveEnv(env: string) {
    this.clearFilters();
    this.filterAmbiente = [env];
    this.applyGlobalFilters();
  }

  /** Metodo clearFilters */
    clearFilters() {
    this.filterAmbiente = [];
    this.filterLocazione = [];
    this.filterNodo = [];
    this.filterStatus = [];
    this.filterZona = [];
    this.filterOSFamily = [];
    this.filterOS = [];
    this.applyGlobalFilters();
  }

  /** Metodo onSelectionChange */
    onSelectionChange(division: string, selected: Host[]) {
    this.selectionsByDivision[division] = selected;
  }

  /** Metodo fixSelected */
    async fixSelected() {
    if (!this.canWrite) return;
    const hostsToUpdate = this.selectedHosts.map(h => h.id);
    if (hostsToUpdate.length === 0) return;
    try {
      await this.backend.updateHostsBulk(hostsToUpdate, { fixed: true });
    } catch (e: any) {
      this.notif.showToast({ type: 'error', message: e?.response?.data?.error || 'Errore durante il fix' });
    } finally {
      this.clearSelectionsAndReload();
    }
  }

  /** Metodo resetSelected */
    async resetSelected() {
    if (!this.canWrite) return;
    const hostsToUpdate = this.selectedHosts.map(h => h.id);
    if (hostsToUpdate.length === 0) return;
    try {
      await this.backend.updateHostsBulk(hostsToUpdate, { fixed: false });
    } catch (e: any) {
      this.notif.showToast({ type: 'error', message: e?.response?.data?.error || 'Errore durante il reset' });
    } finally {
      this.clearSelectionsAndReload();
    }
  }

  /** Metodo clearSelectionsAndReload */
    clearSelectionsAndReload() {
    this.selectionsByDivision = {};
    if (this.fixesTables) {
        this.fixesTables.forEach(table => {
            table.selectedHosts.clear();
            table.loadData();
        });
    }
  }

  /** Metodo openExportModal */
    openExportModal() {
    if (!this.canWrite) return;
    if (this.selectedHosts.length === 0) return;
    this.showExportModal = true;
  }

  /** Metodo closeExportModal */
    closeExportModal() {
    this.showExportModal = false;
  }

  /** Metodo exportSelected */
    async exportSelected() {
    const selectedIds = new Set(this.selectedHosts.map(h => h.id));
    if (selectedIds.size === 0) return;
    
    const res = await this.backend.getHosts({ pageSize: -1 });
    const hosts = res.items.filter(h => selectedIds.has(h.id));
    
    const selectedCols = this.exportColumns.filter(c => c.selected);
    const headers = selectedCols.map(c => c.label);
    const csvRows = [headers.join(';')];
    
    for (const h of hosts) {
      const row = selectedCols.map(c => {
        let val = (h as any)[c.key];
        if (c.key === 'status') {
            val = String(val || '').toLowerCase() === 'ok' ? 'OK' : 'NO';
        }
        val ??= '';
        return `"${val.toString().replaceAll('"', '""')}"`;
      });
      csvRows.push(row.join(';'));
    }
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'export_fixes.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.closeExportModal();
  }
}
