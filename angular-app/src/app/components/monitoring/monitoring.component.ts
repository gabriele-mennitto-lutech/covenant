import { Component } from '@angular/core';
import { MainpageComponent } from '../mainpage/mainpage.component';
import { WipComponent } from '../wip/wip.component';

/** Componente/Servizio MonitoringComponent */
@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [MainpageComponent, WipComponent],
  templateUrl: './monitoring.component.html'
})
export class MonitoringComponent {

}
