import { Injectable } from '@angular/core';

/** Componente/Servizio TableStateService */
@Injectable({
  providedIn: 'root'
})
export class TableStateService {
  /** Proprietà states */
    private states: { [key: string]: any } = {};

  /** Metodo saveState */
    saveState(key: string, state: any) {
    this.states[key] = state;
  }

  /** Metodo getState */
    getState(key: string): any {
    return this.states[key];
  }

  /** Metodo clearState */
    clearState(key: string) {
    delete this.states[key];
  }
}
