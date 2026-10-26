import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

/** Campo di ricerca condiviso con etichetta accessibile e icona decorativa. */
@Component({
  selector: 'app-search-field',
  standalone: true,
  imports: [FormsModule, InputTextModule],
  templateUrl: './search-field.component.html',
  styleUrl: './search-field.component.css'
})
export class SearchFieldComponent {
  @Input({ required: true }) inputId = '';
  @Input({ required: true }) label = '';
  @Input() placeholder = '';
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
}
