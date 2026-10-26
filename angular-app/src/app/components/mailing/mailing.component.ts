import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SearchFieldComponent } from '../search-field/search-field.component';
import axios from 'axios';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-mailing',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, SearchFieldComponent],
  templateUrl: './mailing.component.html',
  styleUrls: ['./mailing.component.css']
})
export class MailingComponent implements OnInit {
  @ViewChild('htmlContainer') htmlContainer!: ElementRef;

  templates: any[] = [];
  searchQuery: string = '';

  showCreateModal: boolean = false;
  showUseModal: boolean = false;
  showRendered: boolean = false;
  renderedHtml: string = '';

  newTemplate: any = {
    title: '',
    description: '',
    subject: '',
    recipients: '',
    content: ''
  };

  selectedTemplate: any = null;
  templateVariables: string[] = [];
  
  useData: any = {
    subject: '',
    recipients: '',
    variables: {}
  };

  private readonly apiUrl = '/api/mailing';

  constructor(private readonly notif: NotificationService) { }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Backspace') {
      const target = event.target as HTMLElement;
      // Previene il comportamento "Back" del browser se l'utente preme backspace fuori da un input
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        event.preventDefault();
      }
    }
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  async loadTemplates() {
    try {
      const response = await axios.get(`${this.apiUrl}/templates`);
      this.templates = response.data;
    } catch (err) {
      console.error('Error fetching templates', err);
    }
  }

  filteredTemplates() {
    if (!this.searchQuery) return this.templates;
    const q = this.searchQuery.toLowerCase();
    return this.templates.filter(t => 
      t.title?.toLowerCase().includes(q) || 
      t.description?.toLowerCase().includes(q)
    );
  }

  openCreateModal() {
    this.newTemplate = { title: '', description: '', subject: '', recipients: '', content: '' };
    this.showCreateModal = true;
  }

  openEditModal() {
    this.newTemplate = { ...this.selectedTemplate };
    this.showUseModal = false;
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  async saveTemplate() {
    try {
      if (this.newTemplate.id) {
        await axios.put(`${this.apiUrl}/templates/${this.newTemplate.id}`, this.newTemplate);
        this.notif.showToast({ type: 'success', message: `Template "${this.newTemplate.title}" aggiornato` });
      } else {
        await axios.post(`${this.apiUrl}/templates`, this.newTemplate);
        this.notif.showToast({ type: 'success', message: `Template "${this.newTemplate.title}" creato` });
      }
      this.closeCreateModal();
      this.loadTemplates();
    } catch (err) {
      console.error('Error saving template', err);
    }
  }

  async deleteTemplate(id: number) {
    if (confirm('Sei sicuro di voler eliminare questo template?')) {
      try {
        await axios.delete(`${this.apiUrl}/templates/${id}`);
        this.notif.showToast({ type: 'warning', message: `Template mail eliminato` });
        this.closeUseModal();
        this.loadTemplates();
      } catch (err) {
        console.error('Error deleting template', err);
      }
    }
  }

  openUseModal(template: any) {
    this.selectedTemplate = template;
    this.useData.subject = template.subject || '';
    this.useData.recipients = template.recipients || '';
    this.useData.variables = {};
    this.showRendered = false;
    this.renderedHtml = '';

    // Extract variables using regex \$\{([^}]+)\}
    const contentRegex = /\$\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    const vars = new Set<string>();
    while ((match = contentRegex.exec(template.content ?? '')) !== null) {
      vars.add(match[1]);
    }
    
    // Check subject for variables too
    const subjectRegex = /\$\{([^}]+)\}/g;
    while ((match = subjectRegex.exec(this.useData.subject ?? '')) !== null) {
      vars.add(match[1]);
    }

    this.templateVariables = Array.from(vars);
    this.templateVariables.forEach(v => {
      this.useData.variables[v] = '';
    });

    this.showUseModal = true;
  }

  closeUseModal() {
    this.showUseModal = false;
    this.selectedTemplate = null;
  }

  renderPreview() {
    if (!this.selectedTemplate) return;
    
    let parsedContent = this.selectedTemplate.content || '';
    for (const v of this.templateVariables) {
      const val = this.useData.variables[v] || '';
      const escapedVar = this.escapeRegExp(v);
      parsedContent = parsedContent.replace(new RegExp(String.raw`\$\{${escapedVar}\}`, 'g'), val);
    }
    
    this.renderedHtml = this.parseMarkdown(parsedContent);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  }

  private parseMarkdown(text: string): string {
    if (!text) return '';
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold and Italic
    html = html.replace(/\*\*([^*]+)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/gim, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]*)\]\(([^)]*)\)/gim, '<a href="$2" target="_blank">$1</a>');
    
    // Paragraphs / Newlines
    html = html.replace(/\n$/gim, '<br />');
    html = html.replace(/\n/gim, '<br />');
    
    return html;
  }

  generateMail() {
    this.renderPreview();
    this.showRendered = true;
  }

  async copyToClipboard() {
    if (this.htmlContainer?.nativeElement) {
      try {
        await navigator.clipboard.writeText(this.htmlContainer.nativeElement.innerText || '');
        alert('Testo copiato negli appunti! Ora puoi incollarlo su Outlook.');
      } catch (err) {
        console.error('Failed to copy', err);
        alert('Errore durante la copia.');
      }
    }
  }
}
