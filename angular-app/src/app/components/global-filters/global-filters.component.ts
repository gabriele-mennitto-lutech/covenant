import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FilterItemComponent, FilterOption } from '../filter-item/filter-item.component';

/** Componente/Servizio GlobalFiltersComponent */
@Component({
  selector: 'app-global-filters',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterItemComponent],
  templateUrl: './global-filters.component.html'
})
export class GlobalFiltersComponent implements OnChanges {
  /** Proprietà mode */
    @Input() mode: 'hosts' | 'fixes' = 'hosts';
  /** Proprietà filterAmbiente */
    @Input() filterAmbiente: string[] = [];
  /** Proprietà filterNodo */
    @Input() filterNodo: string[] = [];
  /** Proprietà filterStatus */
    @Input() filterStatus: string[] = [];
  /** Proprietà filterZona */
    @Input() filterZona: string[] = [];
  /** Proprietà filterLocazione */
    @Input() filterLocazione: string[] = [];
  /** Proprietà filterOSFamily */
    @Input() filterOSFamily: string[] = [];
  /** Proprietà filterOS */
    @Input() filterOS: string[] = [];
  /** Proprietà availableOSVersions */
    @Input() availableOSVersions: string[] = [];

  /** Proprietà presetClick */
    @Output() presetClick = new EventEmitter<{col: string, val: string}>();
  /** Proprietà clearAll */
    @Output() clearAll = new EventEmitter<void>();

  /** Proprietà ambienteOptions */
    ambienteOptions: FilterOption[] = [];
  /** Proprietà locazioneOptions */
    locazioneOptions: FilterOption[] = [];
  /** Proprietà zonaOptions */
    zonaOptions: FilterOption[] = [];
  /** Proprietà nodoOptions */
    nodoOptions: FilterOption[] = [];
  /** Proprietà statusOptions */
    statusOptions: FilterOption[] = [];
  /** Proprietà osFamilyOptions */
    osFamilyOptions: FilterOption[] = [];
  /** Proprietà osVersionsOptions */
    osVersionsOptions: FilterOption[] = [];

  /** Lifecycle hook ngOnChanges */
    ngOnChanges(changes: SimpleChanges) {
    const btnClass = this.mode === 'hosts' ? 'filter-btn-hosts' : 'filter-btn-fixes';

    if (changes['mode'] || !this.ambienteOptions.length) {
      this.ambienteOptions = [
        { label: 'Sviluppo', value: 'sviluppo', cssClass: btnClass },
        { label: 'Collaudo', value: 'collaudo', cssClass: btnClass },
        { label: 'Produzione', value: 'produzione', cssClass: btnClass }
      ];
      if (this.mode === 'hosts') {
        this.ambienteOptions.push(
          { label: 'Dismessa', value: 'dismessa', cssClass: 'filter-btn-hosts' },
          { label: 'Spenta', value: 'spenta', cssClass: 'filter-btn-hosts' }
        );
      }

      this.locazioneOptions = [
        { label: 'Torino', value: 'torino', cssClass: btnClass },
        { label: 'Teulada', value: 'teulada', cssClass: btnClass },
        { label: 'Saxa', value: 'saxa', cssClass: btnClass }
      ];

      this.zonaOptions = [
        { label: 'Intranet', value: 'intranet', cssClass: btnClass },
        { label: 'DMZ (Internet)', value: 'internet', cssClass: btnClass },
        { label: 'DB', value: 'db', cssClass: btnClass }
      ];

      this.nodoOptions = [
        { label: 'Singolo (-)', value: '0', cssClass: btnClass },
        { label: 'Nodo 1', value: '1', cssClass: btnClass },
        { label: 'Nodo 2', value: '2', cssClass: btnClass },
        { label: 'Nodo 3', value: '3', cssClass: btnClass }
      ];

      this.statusOptions = [
        { label: 'Solo Fixate', value: 'true', cssClass: 'filter-btn-fixes' },
        { label: 'Solo Da Fixare (X)', value: 'false', cssClass: 'filter-btn-fixes' }
      ];

      this.osFamilyOptions = [
        { label: 'Windows 10 / 11', value: 'Windows', cssClass: btnClass },
        { label: 'Windows Server', value: 'Windows Server', cssClass: btnClass }
      ];
    }

    if (changes['availableOSVersions'] || changes['mode']) {
      this.osVersionsOptions = (this.availableOSVersions || []).map(os => ({
        label: os,
        value: os,
        cssClass: btnClass
      }));
    }

  }

  /** Metodo setPreset */
    setPreset(col: string, val: string) {
    this.presetClick.emit({ col, val });
  }

  /** Metodo clearFilters */
    clearFilters() {
    this.clearAll.emit();
  }
}
