import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Interfaccia FilterOption */
export interface FilterOption {
  /** Proprietà label */
    label: string;
  /** Proprietà value */
    value: string;
  /** Proprietà cssClass */
    cssClass?: string;
}

/** Componente/Servizio FilterItemComponent */
@Component({
  selector: 'app-filter-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './filter-item.component.html'
})
export class FilterItemComponent {
  /** Proprietà label */
    @Input() label: string = '';
  /** Proprietà options */
    @Input() options: FilterOption[] = [];
  /** Proprietà activeValues */
    @Input() activeValues: string[] = [];
  /** Proprietà labelWidth */
    @Input() labelWidth: string = '80px';
  /** Proprietà labelMarginLeft */
    @Input() labelMarginLeft: string = '0';
  /** Proprietà labelColor */
    @Input() labelColor: string = 'inherit';

  /** Proprietà presetClick */
    @Output() presetClick = new EventEmitter<string>();

  /** Metodo onPresetClick */
    onPresetClick(value: string) {
    this.presetClick.emit(value);
  }

  /** Metodo isActive */
    isActive(value: string): boolean {
    return this.activeValues.includes(value);
  }
}
