import { Component, Input } from '@angular/core';

/** Componente/Servizio MainpageComponent */
@Component({
  selector: 'app-mainpage',
  standalone: true,
  imports: [],
  templateUrl: './mainpage.component.html'
})
export class MainpageComponent {
  /** Proprietà title */
    @Input() title: string = '';
}
