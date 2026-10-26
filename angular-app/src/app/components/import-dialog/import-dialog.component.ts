import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { BackendService, ImportEntity, ImportResult } from '../../services/backend.service';
import { NotificationService } from '../../services/notification.service';

/** Dimensione massima del file accettata dal back-end (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Numero massimo di errori mostrati nel riepilogo */
const MAX_VISIBLE_ERRORS = 50;

/**
 * Popup riutilizzabile per l'import massivo da CSV/JSON (hosts, siti).
 * Permette di scaricare il template CSV, caricare il file compilato e mostra l'esito dell'import.
 * Politica dati: il DB ha la priorità, sui record già presenti vengono completati solo i campi vuoti.
 */
@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule],
  templateUrl: './import-dialog.component.html',
  styleUrls: ['./import-dialog.component.css']
})
export class ImportDialogComponent {
  /** Entità da importare */
    @Input({ required: true }) entity!: ImportEntity;
  /** Etichetta leggibile dell'entità (es. "host", "siti") */
    @Input() entityLabel = '';
  /** Descrizione della chiave usata per il merge */
    @Input() mergeKeyDescription = '';
  /** Visibilità del popup */
    @Input() visible = false;
  /** Evento two-way binding della visibilità */
    @Output() readonly visibleChange = new EventEmitter<boolean>();
  /** Emesso dopo un import completato (per ricaricare i dati) */
    @Output() readonly imported = new EventEmitter<ImportResult>();

  /** File selezionato */
    selectedFile: File | null = null;
  /** Import in corso */
    isUploading = false;
  /** Download template in corso */
    isDownloading = false;
  /** Esito dell'ultimo import */
    result: ImportResult | null = null;
  /** Messaggio di errore bloccante */
    errorMessage = '';

  /** Costruttore di ImportDialogComponent */
    constructor(private readonly backend: BackendService, private readonly notif: NotificationService) {}

  get visibleErrors(): { row: number; error: string }[] {
    return this.result?.errors.slice(0, MAX_VISIBLE_ERRORS) ?? [];
  }

  get hiddenErrorsCount(): number {
    return Math.max(0, (this.result?.errors.length ?? 0) - MAX_VISIBLE_ERRORS);
  }

  /** Metodo close */
    close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.reset();
  }

  /** Metodo reset */
    reset() {
    this.selectedFile = null;
    this.result = null;
    this.errorMessage = '';
    this.isUploading = false;
  }

  /** Metodo downloadTemplate */
    async downloadTemplate() {
    this.isDownloading = true;
    try {
      const blob = await this.backend.downloadImportTemplate(this.entity);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_import_${this.entity}.csv`;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download import template', err);
      this.notif.showToast({ type: 'error', message: 'Impossibile scaricare il template' });
    } finally {
      this.isDownloading = false;
    }
  }

  /** Metodo onFileSelected */
    onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.result = null;
    this.errorMessage = '';
    if (!file) return;

    if (!this.detectFormat(file)) {
      this.errorMessage = 'Formato non supportato: seleziona un file .csv o .json';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.errorMessage = 'Il file supera la dimensione massima di 10MB';
      return;
    }
    this.selectedFile = file;
  }

  /** Metodo upload */
    async upload() {
    if (!this.selectedFile || this.isUploading) return;
    const format = this.detectFormat(this.selectedFile);
    if (!format) return;

    this.isUploading = true;
    this.errorMessage = '';
    this.result = null;
    try {
      const content = await this.selectedFile.text();
      this.result = await this.backend.importFile(this.entity, content, format);
      this.selectedFile = null;
      this.imported.emit(this.result);
    } catch (err: any) {
      console.error('Import failed', err);
      this.errorMessage = err?.response?.data?.error || err?.message || 'Import non riuscito';
    } finally {
      this.isUploading = false;
    }
  }

  private detectFormat(file: File): 'csv' | 'json' | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.json')) return 'json';
    return null;
  }
}
