import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/** Componente/Servizio BigcardComponent */
@Component({
  selector: 'app-bigcard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './bigcard.component.html'
})
export class BigcardComponent {
  /** Proprietà title */
    @Input() title: string = '';
  /** Proprietà isInteractive */
    @Input() isInteractive: boolean = false;
  /** Proprietà routerLinkTarget */
    @Input() routerLinkTarget: string | any[] = [];
}
