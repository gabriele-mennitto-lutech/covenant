import { Component, Input } from '@angular/core';

/** Componente/Servizio WipComponent */
@Component({
  selector: 'app-wip',
  standalone: true,
  imports: [],
  templateUrl: './wip.component.html'
})
export class WipComponent {
  /** Proprietà pageName */
    @Input() pageName: string = 'Questa pagina';
}
