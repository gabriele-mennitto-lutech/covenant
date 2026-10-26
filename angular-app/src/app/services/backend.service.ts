import { Injectable } from '@angular/core';
import axios from 'axios';
import { NotificationService } from './notification.service';

/** Interfaccia Host */
export interface Host {
  /** Identificativo univoco dell'host (chiave primaria surrogata assegnata dal DB) */
    id: number;
  /** Proprietà hostname */
    hostname: string;
  /** Proprietà applicazione */
    applicazione: string | null;
  /** Proprietà riferimento */
    riferimento: string | null;
  /** Proprietà ambiente */
    ambiente: string;
  /** Proprietà company */
    company: string;
  /** Proprietà servizio */
    servizio: string | null;
  /** Proprietà appliance */
    appliance: boolean;
  /** Proprietà zona */
    zona: string;
  /** Proprietà riferimentoEs */
    riferimentoEs: string | null;
  /** Proprietà locazione */
    locazione: string | null;
  /** Proprietà os */
    os: string;
  /** Proprietà manutenzione */
    manutenzione: string | null;
  /** Proprietà status */
    status: boolean;
  /** Proprietà nodo */
    nodo: number;
  /** Proprietà note */
    note: string | null;
  /** Proprietà pianificazione */
    pianificazione: string | null;
  /** Proprietà rfc */
    rfc?: string | null;
  /** Proprietà fixed */
    fixed: boolean;
  /** Proprietà fixable */
    fixable: boolean;
  /** Proprietà divisione */
    divisione?: string | null;
  /** Proprietà ipfe */
    ipfe?: string | null;
  /** Proprietà ipmgt */
    ipmgt?: string | null;
  /** Proprietà ipfe2al */
    ipfe2al?: string | null;
  /** Proprietà vlfe */
    vlfe?: string | null;
  /** Proprietà vlmgt */
    vlmgt?: string | null;
  /** Proprietà vlfe2al */
    vlfe2al?: string | null;
}

/** Riferimento minimo a un host: id univoco + dati descrittivi */
export interface HostRef {
  /** Identificativo univoco dell'host */
    id: number;
  /** Proprietà hostname */
    hostname: string;
  /** Proprietà ambiente */
    ambiente: string;
}

/** Risultato della conversione hostname (+ ambiente) -> id */
export interface HostResolveResult {
  /** Id dell'host selezionato (attivo se presente, altrimenti il più recente) */
    id: number;
  /** Host selezionato */
    host: Host;
  /** Tutti gli host che corrispondono alla ricerca */
    matches: HostRef[];
}

/** Interfaccia Site */
export interface Site {
  /** Proprietà id */
    id: number;
  /** Proprietà urlAliases */
    urlAliases: string;
  /** Proprietà ipVip */
    ipVip: string;
  /** Proprietà nomeBilanciatore */
    nomeBilanciatore: string;
  /** Proprietà servizio */
    servizio: string;
  /** Proprietà tls */
    tls: string;
  /** Proprietà hostReali */
    hostReali: string[];
  /** Proprietà porta */
    porta: number | null;
  /** Proprietà note */
    note: string;
  /** Proprietà ambiente */
    ambiente: string;
}

/** Entita' importabili tramite file CSV/JSON */
export type ImportEntity = 'hosts' | 'sites';

/** Esito di un import CSV/JSON (merge con priorità al DB) */
export interface ImportResult {
  /** Righe dati lette dal file */
    total: number;
  /** Nuovi record creati */
    inserted: number;
  /** Record esistenti completati con i soli campi mancanti */
    merged: number;
  /** Record esistenti senza campi da completare */
    unchanged: number;
  /** Righe scartate */
    skipped: number;
  /** Dettaglio righe scartate (numero di riga del file) */
    errors: { row: number; error: string }[];
  /** Colonne del file non riconosciute (ignorate) */
    ignoredColumns: string[];
}

/** Interfaccia Service */
export interface Service {
  /** Proprietà id */
    id: number;
  /** Proprietà servizio */
    servizio: string;
  /** Proprietà knowledge */
    knowledge: string;
  /** Proprietà stato */
    stato: string;
  /** Proprietà hosts */
    hosts: HostRef[];
}

/** Categoria di una sorgente persistita esplorabile dai dettagli esistenti. */
export type CrossSourceType = 'hosts' | 'services' | 'sites' | 'cves';

/** Riferimento motivato; potential non indica un impatto CVE confermato. */
export interface CrossReference {
  type: CrossSourceType;
  id: number;
  label: string;
  context: string;
  confidence: 'direct' | 'potential';
  reasons: string[];
}

/** Risultato paginato delle correlazioni calcolate dal gateway. */
export interface CrossSourceResult {
  source: CrossReference;
  items: CrossReference[];
  counts: Record<CrossSourceType, number>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Stato di una CVE tracciata */
export type CveStato = 'IN_ANALISI' | 'ARCHIVIATA';

/** Interfaccia Cve (CVE tracciata dal reparto SOC, campi allineati al file Excel) */
export interface Cve {
  /** Proprietà id */
    id: number;
  /** Proprietà problem_id (Excel: ID problem) */
    problem_id: string | null;
  /** Proprietà cve_id (Excel: Riepilogo) */
    cve_id: string;
  /** Proprietà data_inoltro (Excel: Data inoltro) */
    data_inoltro: string | null;
  /** Proprietà data_ultima_modifica (Excel: Data ultima modifica) */
    data_ultima_modifica: string | null;
  /** Proprietà stato_ticket (Excel: Stato, stato del problem sul sito) */
    stato_ticket: string | null;
  /** Proprietà note (Excel: Note) */
    note: string | null;
  /** Proprietà riferimenti (Excel: Riferimenti) */
    riferimenti: string | null;
  /** Proprietà errata (Excel: Errata) */
    errata: string | null;
  /** Proprietà score (Excel: BASE SCORE / CVSS SCORE) */
    score: number | null;
  /** Proprietà cve_origin (Riepilogo originale ITSM, ridondante: non mostrato in UI) */
    cve_origin: string | null;
  /** Proprietà prodotto (prodotto impattato, estratto dal Riepilogo) */
    prodotto: string | null;
  /** Proprietà vendor (vendor impattato, es. Oracle, Microsoft; recuperabile da cve-search) */
    vendor?: string | null;
  /** Proprietà stato (workflow interno) */
    stato: CveStato;
  /** Proprietà motivo_attesa (testo libero, storicizzato) */
    motivo_attesa: string | null;
  /** Proprietà esito (codice standard o motivazione custom "Altro") */
    esito: string | null;
  /** Proprietà impattato */
    impattato: string | null;
  /** Proprietà asset_impattati */
    asset_impattati: string | null;
  /** Proprietà ultima_revisione */
    ultima_revisione: string | null;
  /** Proprietà data_archiviazione */
    data_archiviazione: string | null;
  /** Proprietà flagged (1 = da girare post-riunione) */
    flagged?: number | boolean;
  /** Proprietà created_at */
    created_at?: string;
  /** Proprietà updated_at */
    updated_at?: string;
}

/** Filtri per l'elenco CVE */
export interface CveListParams {
  /** Proprietà stato */
    stato?: CveStato;
  /** Proprietà search */
    search?: string;
  /** Proprietà severita (CSV, derivata dallo score) */
    severita?: string;
  /** Proprietà stato_ticket (CSV) */
    stato_ticket?: string;
  /** Proprietà impattato (CSV) */
    impattato?: string;
  /** Proprietà motivo_attesa (CSV) */
    motivo_attesa?: string;
  /** Proprietà esito (CSV, ALTRO = motivazioni non standard) */
    esito?: string;
  /** Proprietà flagged (solo problem flaggati) */
    flagged?: boolean;
  /** Proprietà date_field (colonna data filtrata da from/to) */
    date_field?: 'data_inoltro' | 'data_archiviazione' | 'ultima_revisione';
  /** Proprietà from */
    from?: string;
  /** Proprietà to */
    to?: string;
  /** Proprietà sortBy */
    sortBy?: string;
  /** Proprietà sortOrder */
    sortOrder?: 'asc' | 'desc';
  /** Proprietà page */
    page?: number;
  /** Proprietà pageSize */
    pageSize?: number;
}

/** Risposta paginata elenco CVE */
export interface CveListResponse {
  /** Proprietà items */
    items: Cve[];
  /** Proprietà total */
    total: number;
  /** Proprietà page */
    page: number;
  /** Proprietà pageSize */
    pageSize: number;
  /** Proprietà totalPages */
    totalPages: number;
}

/** Voce dello storico motivo attesa */
export interface CveMotivoHistory {
  /** Proprietà id */
    id: number;
  /** Proprietà motivo_attesa */
    motivo_attesa: string;
  /** Proprietà data_cambio */
    data_cambio: string;
  /** Proprietà utente */
    utente: string | null;
}

/** Esito dell'import CSV dei problem ITSM */
/** Esito del completamento dei campi mancanti tramite cve-search */
export interface CveEnrichResult {
  /** CVE con almeno un campo completato */
    updated: number;
  /** CVE gia complete o senza dati utili */
    unchanged: number;
  /** CVE non presenti su cve-search */
    notFound: number;
  /** Errori (CVE inesistente o servizio non raggiungibile) */
    failed: number;
  /** Dettaglio per CVE */
    items: { id: number; cve_id: string | null; filled: string[]; error?: string }[];
}

export interface CveImportResult {
  /** Nuovi problem inseriti */
    created: number;
  /** Problem aggiornati senza cambio di stato */
    updated: number;
  /** Problem archiviati tornati Pendenti */
    reopened: number;
  /** Problem attivi non più Pendenti, archiviati */
    archived: number;
  /** Righe importate */
    imported: number;
  /** Righe scartate */
    skipped: number;
  /** Errori per riga */
    errors: { line: number | null, problem_id: string | null, error: string }[];
}

/** Dettagli CVE restituiti da cve-search (normalizzati dal back-end) */
export interface CveDetails {
  /** Proprietà id */
    id: string;
  /** Proprietà state */
    state: string | null;
  /** Proprietà title */
    title: string | null;
  /** Proprietà summary */
    summary: string | null;
  /** Proprietà published */
    published: string | null;
  /** Proprietà modified */
    modified: string | null;
  /** Proprietà assigner */
    assigner: string | null;
  /** Proprietà cvss */
    cvss: { version: string | null; score: number | null; severity: string | null; vector: string | null }[];
  /** Proprietà cwe */
    cwe: string[];
  /** Proprietà capec */
    capec: { id: string; name: string }[];
  /** Proprietà affected */
    affected: { vendor: string; product: string; versions: string[] }[];
  /** Proprietà references */
    references: string[];
  /** Proprietà source */
    source: string;
  /** Proprietà sourceUrl */
    sourceUrl: string;
}

/** Componente/Servizio BackendService */
@Injectable({
  providedIn: 'root'
})
export class BackendService {
  /** Costruttore di BackendService */
    constructor(private readonly notif: NotificationService) { }

  /** Metodo ensureWriteAccess */
    private ensureWriteAccess() {
    try {
      const raw = localStorage.getItem('covenant_auth_user');
      if (!raw) {
        throw new Error('Not authenticated');
      }
      const user = JSON.parse(raw);
      if (!user?.canWrite) {
        throw new Error('Readonly user cannot perform this operation');
      }
    } catch {
      throw new Error('Readonly user cannot perform this operation');
    }
  }

  /** Metodo getSites */
    async getSites(): Promise<{ items: Site[], totalCount: number }> {
    const res = await axios.get('/api/sites');
    return res.data;
  }

  /** Legge relazioni senza raccogliere nuovi dati o modificare il workflow CVE. */
  async getCrossReferences(type: CrossSourceType, id: number,
    params: { target?: CrossSourceType; search?: string; page?: number } = {},
    signal?: AbortSignal): Promise<CrossSourceResult> {
    const res = await axios.get<CrossSourceResult>(`/api/cross-source/${type}/${id}`, { params, signal });
    return res.data;
  }

  /** Recupera un servizio anche se non incluso nella pagina corrente. */
  async getService(id: number): Promise<Service> {
    const res = await axios.get<Service>(`/api/services/${id}`);
    return res.data;
  }

  /** Recupera una CVE per aprire il popup da un riferimento cross source. */
  async getCve(id: number): Promise<Cve> {
    const res = await axios.get<Cve>(`/api/cves/${id}`);
    return res.data;
  }

  /** Metodo getServices */
    async getServices(search?: string, knowledge?: string, page: number = 1, pageSize: number = 50): Promise<{ items: Service[], total: number, page: number, pageSize: number, totalPages: number }> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (knowledge) params.append('knowledge', knowledge);
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());
    const res = await axios.get('/api/services?' + params.toString());
    return res.data;
  }

  /** Metodo createService */
    async createService(service: Partial<Service>): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.post('/api/services', service);
    this.notif.showToast({ type: 'success', message: `Servizio ${service.servizio || ''} creato` });
    return res.data;
  }

  /** Metodo updateService */
    async updateService(id: number, service: Partial<Service>): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.put(`/api/services/${id}`, service);
    this.notif.showToast({ type: 'success', message: `Servizio ${service.servizio || id} aggiornato` });
    return res.data;
  }

  /** Metodo updateSite */
    async updateSite(id: number, partialUpdate: Partial<Site>): Promise<Site> {
    this.ensureWriteAccess();
    const res = await axios.put(`/api/sites/${id}`, partialUpdate);
    this.notif.showToast({ type: 'success', message: `Sito ${partialUpdate.urlAliases || id} aggiornato` });
    return res.data.site;
  }

  /** Metodo createSite */
    async createSite(site: Partial<Site>): Promise<Site> {
    this.ensureWriteAccess();
    const res = await axios.post('/api/sites', site);
    this.notif.showToast({ type: 'success', message: `Sito ${site.urlAliases || ''} creato` });
    return res.data.site;
  }

  /** Metodo deleteSite */
    async deleteSite(id: number): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.delete(`/api/sites/${id}`);
    this.notif.showToast({ type: 'warning', message: `Sito ${id} eliminato` });
    return res.data;
  }

  /** Metodo getHosts */
    async getHosts(params: any = {}): Promise<{ items: Host[], totalCount: number }> {
    const res = await axios.get('/api/hosts', { params });
    return res.data;
  }

  /** Metodo getSettings */
    async getSettings(): Promise<any> {
    const res = await axios.get('/api/settings');
    return res.data;
  }

  /** Metodo updateSettings */
    async updateSettings(settings: any): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.put('/api/settings', settings);
    return res.data;
  }

  /** Metodo getDashboardStats */
    async getDashboardStats(): Promise<any> {
    const res = await axios.get('/api/hosts/stats');
    return res.data;
  }

  /** Metodo getAllHostnames: riferimenti (id, hostname, ambiente) degli host che rispettano i filtri */
    async getAllHostnames(params: any = {}): Promise<HostRef[]> {
    const res = await axios.get('/api/hosts/all-hostnames', { params });
    return res.data;
  }

  /** Metodo getHost: recupera un host per id */
    async getHost(id: number): Promise<Host> {
    const res = await axios.get(`/api/hosts/${encodeURIComponent(id)}`);
    return res.data;
  }

  /** Metodo resolveHost: converte hostname (+ ambiente opzionale) nell'id dell'host */
    async resolveHost(hostname: string, ambiente?: string | null): Promise<HostResolveResult> {
    const params: Record<string, string> = { hostname };
    if (ambiente) params['ambiente'] = ambiente;
    const res = await axios.get('/api/hosts/resolve', { params });
    return res.data;
  }

  /** Metodo updateHost: aggiorna un host per id */
    async updateHost(id: number, partialUpdate: Partial<Host>): Promise<Host> {
    this.ensureWriteAccess();
    const res = await axios.put(`/api/hosts/${encodeURIComponent(id)}`, partialUpdate);
    this.notif.showToast({ type: 'success', message: `Host ${res.data.host?.hostname || id} aggiornato` });
    return res.data.host;
  }

  /** Metodo createHost */
    async createHost(host: Partial<Host>): Promise<Host> {
    this.ensureWriteAccess();
    const res = await axios.post('/api/hosts', host);
    this.notif.showToast({ type: 'success', message: `Host ${host.hostname} creato` });
    return res.data.host;
  }

  /** Metodo updateHostsBulk: aggiornamento massivo per id */
    async updateHostsBulk(ids: number[], partialUpdate: Partial<Host>): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.put('/api/hosts/bulk', { ids, partialUpdate });
    this.notif.showToast({ type: 'info', message: `${res.data?.updatedCount ?? ids.length} host aggiornati` });
    return res.data;
  }

  /** Metodo deleteHostsBulk: eliminazione massiva per id */
    async deleteHostsBulk(ids: number[]): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.delete('/api/hosts/bulk', { data: { ids } });
    this.notif.showToast({ type: 'warning', message: `${res.data?.deletedCount ?? ids.length} host eliminati` });
    return res.data;
  }

  /** Metodo getActivityLogs */
    async getActivityLogs(page: number = 1, pageSize: number = 50): Promise<{ items: any[], total: number }> {
    const res = await axios.get('/api/logs', { params: { page, pageSize } });
    return res.data;
  }

  /** Metodo getCves */
    async getCves(params: CveListParams = {}): Promise<CveListResponse> {
    const res = await axios.get('/api/cves', { params });
    return res.data;
  }

  /** Metodo getCveStats */
    async getCveStats(): Promise<{ inAnalisi: number, archiviate: number, total: number }> {
    const res = await axios.get('/api/cves/stats');
    return res.data;
  }

  /** Metodo createCve */
    async createCve(cve: Partial<Cve>): Promise<Cve> {
    this.ensureWriteAccess();
    const res = await axios.post('/api/cves', cve);
    this.notif.showToast({ type: 'success', message: `CVE ${res.data.cve?.problem_id || res.data.cve?.cve_id || cve.cve_id} aggiunta` });
    return res.data.cve;
  }

  /** Metodo updateCve */
    async updateCve(id: number, partialUpdate: Partial<Cve>): Promise<Cve> {
    this.ensureWriteAccess();
    const res = await axios.put(`/api/cves/${id}`, partialUpdate);
    this.notif.showToast({ type: 'success', message: `CVE ${res.data.cve?.problem_id || res.data.cve?.cve_id || id} aggiornata` });
    return res.data.cve;
  }

  /** Metodo updateCvesStatus (archiviazione / revisione / motivo attesa / flag massivi) */
    async updateCvesStatus(ids: number[], update: Partial<Pick<Cve, 'stato' | 'esito' | 'motivo_attesa' | 'ultima_revisione' | 'flagged'>>): Promise<{ success: boolean, updated: number }> {
    this.ensureWriteAccess();
    const res = await axios.put('/api/cves/bulk/status', { ids, ...update });
    this.notif.showToast({ type: 'info', message: `${res.data.updated} CVE aggiornate` });
    return res.data;
  }

  /** Imposta/rimuove il flag "da girare post-riunione" (senza toast, azione rapida) */
    async setCveFlag(id: number, flagged: boolean): Promise<Cve> {
    this.ensureWriteAccess();
    const res = await axios.put(`/api/cves/${id}`, { flagged });
    return res.data.cve;
  }

  /** Storico dei motivi di attesa di una CVE (dal più recente) */
    async getCveHistory(id: number): Promise<CveMotivoHistory[]> {
    const res = await axios.get(`/api/cves/${id}/history`);
    return res.data;
  }

  /** Importa i problem/CVE dal contenuto CSV esportato da ITSM */
    async importCvesCsv(content: string): Promise<CveImportResult> {
    this.ensureWriteAccess();
    const res = await axios.post('/api/cves/import', content, { headers: { 'Content-Type': 'text/csv' } });
    this.notif.showToast({ type: 'success', message: `Import completato: ${res.data.created} nuove, ${res.data.updated + res.data.reopened + res.data.archived} aggiornate` });
    return res.data;
  }

  /** Esporta in CSV le CVE che rispettano i filtri (paginazione esclusa) e restituisce file e nome suggerito */
    async exportCvesCsv(params: CveListParams = {}): Promise<{ blob: Blob, filename: string }> {
    const { page, pageSize, ...filters } = params;
    const res = await axios.get('/api/cves/export', { params: filters, responseType: 'blob' });
    const disposition: string = res.headers['content-disposition'] || '';
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    return { blob: res.data, filename: match?.[1] || 'cve-export.csv' };
  }

  /** Completa vendor/prodotto/score mancanti delle CVE indicate con i dati di cve-search */
    async enrichCves(ids: number[]): Promise<CveEnrichResult> {
    this.ensureWriteAccess();
    const res = await axios.post('/api/cves/enrich', { ids });
    const r: CveEnrichResult = res.data;
    const missing = r.notFound + r.failed;
    this.notif.showToast({
      type: r.updated > 0 ? 'success' : 'info',
      message: `cve-search: ${r.updated} CVE completate${r.unchanged ? `, ${r.unchanged} invariate` : ''}${missing ? `, ${missing} non recuperate` : ''}`
    });
    return r;
  }

  /** Metodo deleteCve */
    async deleteCve(id: number): Promise<any> {
    this.ensureWriteAccess();
    const res = await axios.delete(`/api/cves/${id}`);
    this.notif.showToast({ type: 'warning', message: `CVE eliminata` });
    return res.data;
  }

  /** Metodo downloadImportTemplate: scarica il template CSV di import per hosts/siti */
    async downloadImportTemplate(entity: ImportEntity): Promise<Blob> {
    const res = await axios.get(`/api/${entity}/import/template`, { responseType: 'blob' });
    return res.data;
  }

  /** Metodo importFile: invia al back-end il contenuto del file CSV/JSON da importare */
    async importFile(entity: ImportEntity, content: string, format: 'csv' | 'json'): Promise<ImportResult> {
    this.ensureWriteAccess();
    const res = await axios.post(`/api/${entity}/import`, content, {
      params: { format },
      headers: { 'Content-Type': 'text/plain' },
      transformRequest: [(data: string) => data]
    });
    return res.data;
  }

  /** Metodo searchCveOnline (dettagli da cve-search via back-end) */
    async searchCveOnline(cveId: string): Promise<CveDetails> {
    const res = await axios.get(`/api/external/cve-search/${encodeURIComponent(cveId.trim().toUpperCase())}`);
    return res.data;
  }
}
