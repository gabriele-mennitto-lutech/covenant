import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Host, HostRef, BackendService } from '../../services/backend.service';
import { TableConfigService } from '../../services/table-config.service';
import { TableStateService } from '../../services/table-state.service';
import { Subscription } from 'rxjs';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { AuthService } from '../../services/auth.service';

/** Componente/Servizio SharedTableComponent */
@Component({
  selector: 'app-shared-table',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CheckboxModule, InputTextModule, PaginatorModule],
  templateUrl: './shared-table.component.html'
})
export class SharedTableComponent implements OnChanges, OnInit, OnDestroy {
  /** Proprietà baseFilters */
    @Input() baseFilters: any = {}; // From parent (e.g., { excludeServizio: 'appliance' })
  /** Proprietà title */
    @Input() title = 'Table';
  /** Proprietà iconClass */
    @Input() iconClass = 'fa-solid fa-table';
  /** Proprietà mode */
    @Input() mode: 'hosts' | 'fixes' = 'hosts';
  /** Proprietà filtersCollapsed */
    @Input() filtersCollapsed = false;

  /** Proprietà selectionChange */
    @Output() selectionChange = new EventEmitter<Host[]>();
  /** Proprietà envClick */
    @Output() envClick = new EventEmitter<string>();

  /** Proprietà displayedHosts */
    displayedHosts: Host[] = [];
  /** Proprietà selectedHosts */
    selectedHosts: Set<string> = new Set();
  /** Proprietà totalCount */
    totalCount = 0;
  /** Proprietà first */
    first = 0;
  /** Proprietà rows */
    rows = 50;
  /** Proprietà isCollapsed */
    isCollapsed = false;

  /** Proprietà filterHostname */
    filterHostname = '';
  /** Proprietà filterApp */
    filterApp = '';
  /** Proprietà filterOs */
    filterOs = '';
  /** Proprietà searchAmbiente */
    searchAmbiente = '';
  /** Proprietà filterServizio */
    filterServizio = '';
  /** Proprietà searchNodo */
    searchNodo = '';
  /** Proprietà filterManutenzione */
    filterManutenzione = '';
  /** Proprietà searchFixed */
    searchFixed = '';
  /** Proprietà filterLocazione */
    filterLocazione = '';
  /** Proprietà filterZona */
    filterZona = '';
  /** Proprietà filterCompagnia */
    filterCompagnia = '';
  /** Proprietà filterRfc */
    filterRfc = '';
  /** Proprietà filterRiferimento */
    filterRiferimento = '';
  /** Proprietà filterRiferimentoEs */
    filterRiferimentoEs = '';
  /** Proprietà filterNote */
    filterNote = '';
  /** Proprietà filterPianificazione */
    filterPianificazione = '';
  /** Proprietà filterFixable */
    filterFixable = '';
  /** Proprietà filterDivisione */
    filterDivisione = '';
  /** Proprietà filterStatus */
    filterStatus = '';


  /** Proprietà sortCol */
    sortCol = '';
  /** Proprietà sortDir */
    sortDir = 0;

  /** Proprietà lastSelectedRowIndex */
    lastSelectedRowIndex = -1;

  /** Proprietà visibleColumns */
    visibleColumns: Set<string> = new Set();
  /** Proprietà subs */
    private subs: Subscription = new Subscription();

  /** Costruttore di SharedTableComponent */
    constructor(
    private readonly backend: BackendService, 
    private readonly configService: TableConfigService,
    private readonly tableState: TableStateService,
    public readonly auth: AuthService
  ) {}

  get canWrite(): boolean {
    return this.auth.canWrite();
  }

  /** Lifecycle hook ngOnInit */
    ngOnInit() {
    if (this.mode === 'hosts') {
      this.subs.add(this.configService.hostsCols$.subscribe(cols => {
        this.visibleColumns = new Set(cols.filter(c => c.selected).map(c => c.key));
      }));
    } else {
      this.subs.add(this.configService.fixesCols$.subscribe(cols => {
        this.visibleColumns = new Set(cols.filter(c => c.selected).map(c => c.key));
      }));
    }

    const state = this.tableState.getState(this.title + '_' + this.mode);
    if (state) {
      this.first = state.first;
      this.rows = state.rows;
      this.sortCol = state.sortCol;
      this.sortDir = state.sortDir;
      this.filterHostname = state.filterHostname;
      this.filterApp = state.filterApp;
      this.filterOs = state.filterOs;
      this.searchAmbiente = state.searchAmbiente;
      this.filterServizio = state.filterServizio;
      this.searchNodo = state.searchNodo;
      this.filterManutenzione = state.filterManutenzione;
      this.searchFixed = state.searchFixed || state.searchStatus;
      this.filterLocazione = state.filterLocazione;
      this.filterZona = state.filterZona;
      this.filterCompagnia = state.filterCompagnia;
      this.filterRfc = state.filterRfc;
      this.filterRiferimento = state.filterRiferimento;
      this.filterRiferimentoEs = state.filterRiferimentoEs;
      this.filterNote = state.filterNote;
      this.filterPianificazione = state.filterPianificazione;
      this.filterFixable = state.filterFixable;
      this.filterDivisione = state.filterDivisione;
      this.filterStatus = state.filterStatus;

      if (state.selectedHosts) {
        this.selectedHosts = new Set(state.selectedHosts);
      }
    }

    this.loadData();
  }

  /** Lifecycle hook ngOnDestroy */
    ngOnDestroy() {
    this.tableState.saveState(this.title + '_' + this.mode, {
      first: this.first,
      rows: this.rows,
      sortCol: this.sortCol,
      sortDir: this.sortDir,
      filterHostname: this.filterHostname,
      filterApp: this.filterApp,
      filterOs: this.filterOs,
      searchAmbiente: this.searchAmbiente,
      filterServizio: this.filterServizio,
      searchNodo: this.searchNodo,
      filterManutenzione: this.filterManutenzione,
      searchFixed: this.searchFixed,
      filterLocazione: this.filterLocazione,
      filterZona: this.filterZona,
      filterCompagnia: this.filterCompagnia,
      filterRfc: this.filterRfc,
      filterRiferimento: this.filterRiferimento,
      filterRiferimentoEs: this.filterRiferimentoEs,
      filterNote: this.filterNote,
      filterPianificazione: this.filterPianificazione,
      filterFixable: this.filterFixable,
      filterDivisione: this.filterDivisione,
      filterStatus: this.filterStatus,

      selectedHosts: Array.from(this.selectedHosts)
    });
    this.subs.unsubscribe();
  }

  /** Metodo isColumnVisible */
    isColumnVisible(key: string): boolean {
    return this.visibleColumns.has(key);
  }

  /** Separatore usato nella chiave di riga (id___hostname___ambiente) */
    private static readonly ROW_KEY_SEPARATOR = '___';

  /** Metodo getRowId: chiave univoca di riga basata sull'id dell'host */
    getRowId(h: HostRef): string {
    const sep = SharedTableComponent.ROW_KEY_SEPARATOR;
    return `${h.id}${sep}${h.hostname}${sep}${h.ambiente}`;
  }

  /** Metodo parseRowId: ricostruisce il riferimento host dalla chiave di riga (null se non valida) */
    private parseRowId(rowId: string): HostRef | null {
    const parts = rowId.split(SharedTableComponent.ROW_KEY_SEPARATOR);
    const id = Number(parts[0]);
    if (parts.length < 3 || !Number.isSafeInteger(id) || id <= 0) return null;
    return { id, hostname: parts[1], ambiente: parts.slice(2).join(SharedTableComponent.ROW_KEY_SEPARATOR) };
  }

  /** Colonne con visibilità invertita rispetto allo stato globale dei filtri. */
    activeColumnFilters: Set<string> = new Set();

  /** Metodo onHeaderClick */
    onHeaderClick(event: Event, col: string) {
    if (this.hasShiftKey(event)) {
      if (this.activeColumnFilters.has(col)) {
        this.activeColumnFilters.delete(col);
      } else {
        this.activeColumnFilters.add(col);
      }
    } else {
      this.sortBy(col);
    }
  }

  /** Metodo isFilterVisible */
    isFilterVisible(col: string): boolean {
    return this.activeColumnFilters.has(col) ? this.filtersCollapsed : !this.filtersCollapsed;
  }

  /** Metodo clearTextFilters */
    clearTextFilters() {
    this.filterHostname = '';
    this.filterApp = '';
    this.filterOs = '';
    this.searchAmbiente = '';
    this.filterServizio = '';
    this.searchNodo = '';
    this.filterManutenzione = '';
    this.searchFixed = '';
    this.filterLocazione = '';
    this.filterZona = '';
    this.filterCompagnia = '';
    this.filterRfc = '';
    this.filterRiferimento = '';
    this.filterRiferimentoEs = '';
    this.filterNote = '';
    this.filterPianificazione = '';
    this.filterFixable = '';
    this.filterDivisione = '';
    this.filterStatus = '';
    this.activeColumnFilters.clear();
    this.loadData();
  }

  /** Lifecycle hook ngOnChanges */
    ngOnChanges(changes: SimpleChanges) {
    if (changes['filtersCollapsed']) {
      this.activeColumnFilters.clear();
    }
    if (changes['baseFilters']) {
      this.first = 0; // Reset page
      this.loadData();
    }
  }

  /** Metodo toggleCollapse */
    toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  /** Metodo sortBy */
    sortBy(col: string) {
    if (this.sortCol === col) {
      if (this.sortDir === 1) this.sortDir = -1;
      else { this.sortDir = 0; this.sortCol = ''; }
    } else {
      this.sortCol = col;
      this.sortDir = 1;
    }
    this.loadData();
  }

  /** Metodo onPageChange */
    onPageChange(event: any) {
    this.first = event.first;
    this.rows = event.rows;
    this.loadData();
  }

  /** Metodo buildFilterParams */
    buildFilterParams(): any {
    const params: any = {
      page: (this.first / this.rows) + 1,
      pageSize: this.rows,
      ...this.baseFilters
    };

    if (this.sortCol) {
      params.sortCol = this.sortCol;
      params.sortDir = this.sortDir;
    }

    const textFilters: Record<string, string> = {
      hostname: this.filterHostname,
      applicazione: this.filterApp,
      os: this.filterOs,
      ambiente: this.searchAmbiente,
      locazione: this.filterLocazione,
      zona: this.filterZona,
      compagnia: this.filterCompagnia,
      rfc: this.filterRfc,
      servizio: this.filterServizio,
      manutenzione: this.filterManutenzione,
      fixed: this.searchFixed,
      nodo: this.searchNodo,
      riferimento: this.filterRiferimento,
      riferimentoEs: this.filterRiferimentoEs,
      note: this.filterNote,
      pianificazione: this.filterPianificazione,
      fixable: this.filterFixable,
      divisione: this.filterDivisione,
      status: this.filterStatus
    };

    Object.entries(textFilters).forEach(([key, value]) => {
      if (value) {
        params[key] = value;
      }
    });


    return params;
  }

  /** Metodo loadData */
    async loadData() {
    try {
      const params = this.buildFilterParams();
      const res = await this.backend.getHosts(params);
      this.displayedHosts = res.items;
      this.totalCount = res.totalCount;
    } catch (e) {
      console.error('Error loading data', e);
    }
  }

  /** Metodo onTableMouseDown */
    onTableMouseDown(event: MouseEvent) {
    // Evita la selezione testuale nativa del browser se si tiene premuto shift
    if (event.shiftKey) {
      event.preventDefault();
    }
  }

  /** Metodo onSelectAllClick */
    async onSelectAllClick(event: Event) {
    event.stopPropagation();
    
    // We determine the target state by looking if all CURRENTLY DISPLAYED hosts are selected
    // If they are all selected, we deselect them all. Otherwise we select based on modifier keys.
    const allDisplayedSelected = this.displayedHosts.every(h => this.selectedHosts.has(this.getRowId(h)));
    const targetState = !allDisplayedSelected;

    if (targetState) {
      if (this.hasShiftKey(event)) {
        // Select ALL matching hosts across ALL pages
        try {
          const params = this.buildFilterParams();
          delete params.page;
          delete params.pageSize; 
          const allHostRefs = await this.backend.getAllHostnames(params);
          allHostRefs.forEach(h => this.selectedHosts.add(this.getRowId(h)));
        } catch (e) {
          console.error('Error fetching all hostnames', e);
        }
      } else {
        // Select ONLY on the current page
        this.displayedHosts.forEach(h => this.selectedHosts.add(this.getRowId(h)));
      }
    } else {
      // Clear selection completely
      this.selectedHosts.clear();
    }
    
    this.emitSelection();
  }

  /** Metodo onRowCheckboxClick */
    onRowCheckboxClick(event: Event, index: number, host: Host) {
    event.stopPropagation();
    
    const rowId = this.getRowId(host);
    
    if (this.hasShiftKey(event) && this.selectedHosts.has(rowId)) {
      this.selectedHosts.clear();
      this.lastSelectedRowIndex = -1;
      this.emitSelection();
      return;
    }

    if (this.hasShiftKey(event) && this.lastSelectedRowIndex !== -1) {
      const start = Math.min(this.lastSelectedRowIndex, index);
      const end = Math.max(this.lastSelectedRowIndex, index);

      for (let i = start; i <= end; i++) {
        const h = this.displayedHosts[i];
        this.selectedHosts.add(this.getRowId(h));
      }
    } else {
      this.toggleHostSelection(rowId);
    }
    
    this.lastSelectedRowIndex = index;
    this.emitSelection();
  }

  private toggleHostSelection(rowId: string): void {
    if (this.selectedHosts.has(rowId)) {
      this.selectedHosts.delete(rowId);
      return;
    }
    this.selectedHosts.add(rowId);
  }

  /** Metodo isAllSelected */
    isAllSelected(): boolean {
    return this.displayedHosts.length > 0 && this.displayedHosts.every(h => this.selectedHosts.has(this.getRowId(h)));
  }

  /** Metodo emitSelection */
    emitSelection() {
    const selected = Array.from(this.selectedHosts)
      .map(rowId => this.parseRowId(rowId))
      .filter((ref): ref is HostRef => ref !== null) as Host[];
    this.selectionChange.emit(selected);
  }

  private hasShiftKey(event: Event): boolean {
    if (event instanceof MouseEvent || event instanceof KeyboardEvent) {
      return event.shiftKey;
    }
    return false;
  }

  /** Metodo toggleFixedFast */
    async toggleFixedFast(host: Host, event: Event) {
    if (!this.canWrite) return;
    event.stopPropagation();
    const newFixed = !host.fixed;
    try {
      await this.backend.updateHost(host.id, { fixed: newFixed });
      await this.loadData(); // reload
    } catch (e) {
      console.error(e);
    }
  }

  /** Metodo onEnvClick */
    onEnvClick(env: string, event: Event) {
    event.stopPropagation();
    this.envClick.emit(env.toLowerCase());
  }
}
