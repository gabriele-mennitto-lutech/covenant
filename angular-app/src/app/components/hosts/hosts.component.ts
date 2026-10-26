import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { BackendService, Host } from '../../services/backend.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription } from 'rxjs';
import { SharedTableComponent } from '../shared-table/shared-table.component';
import { GlobalFiltersComponent } from '../global-filters/global-filters.component';
import { InputSwitchModule } from 'primeng/inputswitch';
import { AuthService } from '../../services/auth.service';
import { ImportDialogComponent } from '../import-dialog/import-dialog.component';

/** Componente/Servizio HostsComponent */
@Component({
  selector: 'app-hosts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SharedTableComponent, GlobalFiltersComponent, InputSwitchModule, ImportDialogComponent],
  templateUrl: './hosts.component.html',
})
export class HostsComponent implements OnInit, OnDestroy {
  /** Proprietà windowsTable */
    @ViewChild('windowsTable') readonly windowsTable!: SharedTableComponent;
  /** Proprietà applianceTable */
    @ViewChild('applianceTable') readonly applianceTable!: SharedTableComponent;

  /** Proprietà hosts */
    hosts: Host[] = []; // Only used for export if we want to fetch full, but wait, export now uses allSelectedHosts which are just mock Host objects with hostname!
  // We need to fix export later, since selectedHosts now only has hostnames.
  /** Proprietà baseFiltersWindows */
    baseFiltersWindows: any = { appliance: false };
  /** Proprietà baseFiltersAppliance */
    baseFiltersAppliance: any = { appliance: true };
  /** Proprietà isLoading */
    isLoading = false;

  /** Proprietà filterAmbiente */
    filterAmbiente: string[] = [];
  /** Proprietà filterNodo */
    filterNodo: string[] = [];
  /** Proprietà filterZona */
    filterZona: string[] = [];
  /** Proprietà filterLocazione */
    filterLocazione: string[] = [];
  /** Proprietà filterOSFamily */
    filterOSFamily: string[] = [];
  /** Proprietà filterOS */
    filterOS: string[] = [];
  /** Proprietà availableOS */
    availableOS: string[] = [];
    readonly windowsVersions = [
      'Windows 10', 'Windows 11', 'Windows Server 2016',
      'Windows Server 2019', 'Windows Server 2022', 'Windows Server 2025'
    ];
  /** Proprietà filtersCollapsed */
    filtersCollapsed = true;

  /** Proprietà showExportModal */
    showExportModal = false;
  /** Proprietà showDismettiModal */
    showDismettiModal = false;
  /** Proprietà showModificaModal */
    showModificaModal = false;
  /** Proprietà showImportDialog */
    showImportDialog = false;
  /** Proprietà modificaData */
    modificaData: any = {};
  /** Proprietà dismettiCount */
    dismettiCount = 0;
  /** Proprietà pendingDismesse */
    pendingDismesse: Host[] = [];
  /** Proprietà pendingNotDismesse */
    pendingNotDismesse: Host[] = [];
  /** Proprietà exportColumns */
    readonly exportColumns = [
    { key: 'hostname', label: 'Hostname', selected: true },
    { key: 'applicazione', label: 'Applicazione', selected: true },
    { key: 'riferimento', label: 'Riferimento', selected: false },
    { key: 'ambiente', label: 'Ambiente', selected: true },
    { key: 'company', label: 'Company', selected: false },
    { key: 'servizio', label: 'Servizio', selected: true },
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

  /** Proprietà selectedHostsMap */
    selectedHostsMap: Map<string, Host> = new Map();

  /** Proprietà sub */
    private sub!: Subscription;
  /** Proprietà routeSub */
    private routeSub!: Subscription;

  /** Costruttore di HostsComponent */
    constructor(private readonly backend: BackendService, private readonly route: ActivatedRoute, public readonly auth: AuthService, private readonly notif: NotificationService) {}

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
      const osSet = new Set(res.items.map(h => h.os).filter(os => os && os !== '-'));
      this.availableOS = Array.from(osSet).sort((a, b) => a.localeCompare(b));
    }).catch(err => console.error(err));

    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['ambiente']) {
        const amb = params['ambiente'].toLowerCase();
        this.filterAmbiente = [amb];
      }
      this.applyGlobalFilters();
      this.isLoading = false;
    });
  }

  /** Lifecycle hook ngOnDestroy */
    ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  private toggleFilterValue(filters: string[], value: string): void {
    const idx = filters.indexOf(value);
    if (idx > -1) {
      filters.splice(idx, 1);
      return;
    }
    filters.push(value);
  }

  /** Proprietà currentAvailableOSVersions */
    currentAvailableOSVersions: string[] = [];

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

    if (this.filterNodo.length > 0) base.nodo = this.filterNodo.join(',');
    if (this.filterZona.length > 0) base.zona = this.filterZona.join(',');
    if (this.filterLocazione.length > 0) base.locazione = this.filterLocazione.join(',');
    
    if (this.filterOSFamily.length > 0) base.osFamily = this.filterOSFamily.join(',');
    if (this.filterOS.length > 0) base.os = this.filterOS.join(',');

    this.baseFiltersWindows = { ...base, appliance: false };
    this.baseFiltersAppliance = { ...base, appliance: true };
  }

  /** Metodo setPreset */
    setPreset(col: string, val: string) {
    const filterMap: Record<string, string[]> = {
      ambiente: this.filterAmbiente,
      nodo: this.filterNodo,
      zona: this.filterZona,
      locazione: this.filterLocazione,
      osFamily: this.filterOSFamily,
      os: this.filterOS
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
    this.filterNodo = [];
    this.filterZona = [];
    this.filterLocazione = [];
    this.filterOSFamily = [];
    this.filterOS = [];
    this.applyGlobalFilters();
    
    if (this.windowsTable) this.windowsTable.clearTextFilters();
    if (this.applianceTable) this.applianceTable.clearTextFilters();
  }

  /** Metodo onSelectionChange */
    onSelectionChange(selected: Host[]) {
    // We get selected hosts from each table. We need to maintain a global set of selected hosts.
    // However, it's easier if each table emits its selection, and we just merge them.
    // We can't just overwrite, because an event from table 1 shouldn't clear table 2's selection.
    // Let's use a method that takes the table id and its selection.
    // Actually, each table emits its full selection. If we want global selection, we can just ask the child components, or have `onSelectionChange` store them in a Map keyed by table.
  }

  // To properly handle selection from multiple tables:
  /** Proprietà selectionWindows */
    selectionWindows: Host[] = [];
  /** Proprietà selectionAppliance */
    selectionAppliance: Host[] = [];

  /** Metodo onWindowsSelection */
    onWindowsSelection(selected: Host[]) {
    this.selectionWindows = selected;
  }

  /** Metodo onApplianceSelection */
    onApplianceSelection(selected: Host[]) {
    this.selectionAppliance = selected;
  }

  get allSelectedHosts(): Host[] {
    return [...this.selectionWindows, ...this.selectionAppliance];
  }

  /** Metodo dismettiSelected */
    async dismettiSelected() {
    if (!this.canWrite) return;
    const hosts = this.allSelectedHosts;
    if (hosts.length === 0) return;

    this.pendingDismesse = hosts.filter(h => (h.ambiente || '').toLowerCase().includes('dismessa'));
    this.pendingNotDismesse = hosts.filter(h => !(h.ambiente || '').toLowerCase().includes('dismessa'));

    if (this.pendingDismesse.length > 0) {
      this.dismettiCount = this.pendingDismesse.length;
      this.showDismettiModal = true;
    } else {
      try {
        await this.backend.updateHostsBulk(this.pendingNotDismesse.map(h => h.id), { ambiente: 'Dismessa' });
      } catch (e: any) {
        this.notif.showToast({ type: 'error', message: e?.response?.data?.error || 'Errore durante la dismissione' });
      } finally {
        this.clearSelectionsAndReload();
      }
    }
  }

  /** Metodo closeDismettiModal */
    closeDismettiModal() {
    this.showDismettiModal = false;
  }

  /** Metodo salvaModificaMassiva */
    async salvaModificaMassiva() {
    if (!this.canWrite) return;
    try {
      await this.backend.updateHostsBulk(this.allSelectedHosts.map(h => h.id), this.modificaData);
    } catch (e: any) {
      this.notif.showToast({ type: 'error', message: e?.response?.data?.error || 'Errore durante la modifica massiva' });
    } finally {
      this.clearSelectionsAndReload();
      this.closeModificaModal();
    }
  }

  /** Metodo confirmDismetti */
    async confirmDismetti() {
    if (!this.canWrite) return;
    try {
      await this.backend.deleteHostsBulk(this.pendingDismesse.map(h => h.id));
      if (this.pendingNotDismesse.length > 0) {
        await this.backend.updateHostsBulk(this.pendingNotDismesse.map(h => h.id), { ambiente: 'Dismessa' });
      }
    } catch (e: any) {
      this.notif.showToast({ type: 'error', message: e?.response?.data?.error || 'Errore durante la dismissione' });
    } finally {
      this.clearSelectionsAndReload();
      this.closeDismettiModal();
    }
  }

  /** Metodo clearSelectionsAndReload */
    clearSelectionsAndReload() {
    this.selectionWindows = [];
    this.selectionAppliance = [];
    if (this.windowsTable) {
        this.windowsTable.selectedHosts.clear();
        this.windowsTable.loadData();
    }
    if (this.applianceTable) {
        this.applianceTable.selectedHosts.clear();
        this.applianceTable.loadData();
    }
  }

  /** Metodo openImportDialog */
    openImportDialog() {
    if (!this.canWrite) return;
    this.showImportDialog = true;
  }

  /** Metodo onHostsImported: ricarica le tabelle dopo un import */
    onHostsImported() {
    this.clearSelectionsAndReload();
  }

  /** Metodo openExportModal */
    openExportModal() {
    if (!this.canWrite) return;
    if (this.allSelectedHosts.length === 0) return;
    this.showExportModal = true;
  }

  /** Metodo closeExportModal */
    closeExportModal() {
    this.showExportModal = false;
  }

  /** Metodo exportSelected */
    async exportSelected() {
    const selectedIds = new Set(this.allSelectedHosts.map(h => h.id));
    if (selectedIds.size === 0) return;
    
    // We only have hostnames. We must fetch full hosts from backend!
    const res = await this.backend.getHosts({ pageSize: -1 }); // get all
    const hosts = res.items.filter(h => selectedIds.has(h.id));

    const selectedCols = this.exportColumns.filter(c => c.selected);
    const headers = selectedCols.map(c => c.label);
    const csvRows = [headers.join(';')];
    
    for (const h of hosts) {
      const row = selectedCols.map(c => {
        let val = (h as any)[c.key];
        if (c.key === 'status') {
            const strVal = String(val || '').toLowerCase();
            val = (val === true || strVal === 'ok' || strVal === 'true') ? 'OK' : 'NO';
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
    link.setAttribute('download', 'export_hosts.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    this.closeExportModal();
  }

  /** Metodo openModificaModal */
    openModificaModal() {
    if (!this.canWrite) return;
    if (this.allSelectedHosts.length === 0) return;
    this.modificaData = {
        ambiente: '', company: '', servizio: '', zona: '', locazione: '', manutenzione: ''
    };
    this.showModificaModal = true;
  }

  /** Metodo closeModificaModal */
    closeModificaModal() {
    this.showModificaModal = false;
  }

  private normalizeModificaValue(key: string, rawVal: string): string | number | boolean {
    const val = rawVal.trim();
    if (['fixable', 'fixed', 'appliance'].includes(key)) {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
    }
    if (key === 'nodo') {
        return Number.parseInt(val, 10);
    }
    return val;
  }

  private buildModificaPayload(): Record<string, any> {
    const payload: Record<string, any> = {};
    for (const key of Object.keys(this.modificaData)) {
        const rawVal = this.modificaData[key];
        if (rawVal && rawVal.trim() !== '') {
            payload[key] = this.normalizeModificaValue(key, rawVal);
        }
    }
    return payload;
  }

  /** Metodo confirmModifica */
    async confirmModifica() {
    if (!this.canWrite) return;
    const hostsToUpdate = this.allSelectedHosts.map(h => h.id);
    if (hostsToUpdate.length === 0) return;

    const payload = this.buildModificaPayload();

    if (Object.keys(payload).length > 0) {
        await this.backend.updateHostsBulk(hostsToUpdate, payload);
        this.clearSelectionsAndReload();
    }
    
    this.closeModificaModal();
  }
}
