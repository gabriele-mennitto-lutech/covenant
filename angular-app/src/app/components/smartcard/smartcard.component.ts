import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Componente/Servizio SmartcardComponent */
@Component({
  selector: 'app-smartcard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './smartcard.component.html'
})
export class SmartcardComponent {
  /** Proprietà title */
    @Input() title: string = '';
  /** Proprietà value */
    @Input() value: number | string = '-';
  /** Proprietà color */
    @Input() color: string = ''; // es. var(--env-produzione-color)
  /** Proprietà routerLinkTarget */
    @Input() routerLinkTarget: string | any[] = [];
  /** Proprietà queryParamsTarget */
    @Input() queryParamsTarget: any = {};
  /** Proprietà hasHoverAnimation */
    @Input() hasHoverAnimation: boolean = false;
  /** Proprietà zoneDetails */
    @Input() zoneDetails: { torino: number, teulada: number, saxa: number } | null = null;
  /** Proprietà hoverText */
    @Input() hoverText: string = '';
}
