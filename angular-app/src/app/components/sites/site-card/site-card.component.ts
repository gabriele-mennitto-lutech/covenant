import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Site } from '../../../services/backend.service';
import { TagModule } from 'primeng/tag';

/** Componente/Servizio SiteCardComponent */
@Component({
  selector: 'app-site-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TagModule],
  templateUrl: './site-card.component.html',
  styleUrls: ['./site-card.component.css']
})
export class SiteCardComponent {
  /** Proprietà site */
    @Input() site!: Site;
  /** Proprietà openDialog */
    @Output() openDialog = new EventEmitter<Site>();

  /** Metodo onCardClick */
    onCardClick() {
    this.openDialog.emit(this.site);
  }

  /** Metodo copyToClipboard */
    copyToClipboard(url: string, event: Event) {
    event.stopPropagation();
    const fullUrl = `https://${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      console.log('Copied to clipboard:', fullUrl);
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  }
}
