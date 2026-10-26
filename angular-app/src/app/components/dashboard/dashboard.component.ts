import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { BackendService } from '../../services/backend.service';
import { SmartcardComponent } from '../smartcard/smartcard.component';
import { BigcardComponent } from '../bigcard/bigcard.component';

declare var Chart: any;

/** Componente/Servizio DashboardComponent */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, SmartcardComponent, BigcardComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, AfterViewInit {
  /** Proprietà totalHosts */
    totalHosts = 0;
  /** Proprietà prodHosts */
    prodHosts = 0;
  /** Proprietà collHosts */
    collHosts = 0;
  /** Proprietà devHosts */
    devHosts = 0;
  /** Proprietà fixPercent */
    fixPercent = 0;
  /** Proprietà fixesTotal */
    fixesTotal = 0;
  /** Proprietà fixesDone */
    fixesDone = 0;
  /** Proprietà dismesseHosts */
    dismesseHosts = 0;
  /** Proprietà servicesStats */
    servicesStats = { total: 0, full: 0, limited: 0, absent: 0 };
  /** Proprietà sitesStats */
    sitesStats = { total: 0, prod: 0, coll: 0, dev: 0 };

  /** Proprietà prodZones */
    prodZones = { torino: 0, teulada: 0, saxa: 0 };
  /** Proprietà collZones */
    collZones = { torino: 0, teulada: 0, saxa: 0 };
  /** Proprietà devZones */
    devZones = { torino: 0, teulada: 0, saxa: 0 };
  
  // hosts array removed since we use getDashboardStats
  /** Proprietà chartInstance */
    chartInstance: any = null;
  /** Proprietà servicesChartInstance */
    servicesChartInstance: any = null;
  /** Proprietà sitesChartInstance */
    sitesChartInstance: any = null;

  /** Proprietà envChartRef */
    @ViewChild('envChart') envChartRef!: ElementRef;
  /** Proprietà servicesChartRef */
    @ViewChild('servicesChart') servicesChartRef!: ElementRef;
  /** Proprietà sitesChartRef */
    @ViewChild('sitesChart') sitesChartRef!: ElementRef;

  /** Costruttore di DashboardComponent */
    constructor(private readonly backend: BackendService, @Inject(PLATFORM_ID) private readonly platformId: Object) {}

  /** Lifecycle hook ngOnInit */
    ngOnInit() {
    this.backend.getDashboardStats().then(res => {
      this.totalHosts = res.totalHosts;
      this.dismesseHosts = res.dismesseHosts;
      this.prodHosts = res.prodHosts;
      this.collHosts = res.collHosts;
      this.devHosts = res.devHosts;
      this.prodZones = res.prodZones;
      this.collZones = res.collZones;
      this.devZones = res.devZones;
      this.fixesTotal = res.fixesTotal;
      this.fixesDone = res.fixesDone;
      this.fixPercent = res.fixPercent;
      if (res.servicesStats) {
        this.servicesStats = res.servicesStats;
      }
      if (res.sitesStats) {
        this.sitesStats = res.sitesStats;
      }
      
      if (isPlatformBrowser(this.platformId) && this.envChartRef) {
          this.initChart();
      }
    });
  }

  /** Lifecycle hook ngAfterViewInit */
    ngAfterViewInit() {
      if (this.totalHosts > 0 && isPlatformBrowser(this.platformId)) {
          this.initChart();
      }
  }

  /** Metodo createStripedPattern */
    createStripedPattern(ctx: CanvasRenderingContext2D) {
    const patternCanvas = document.createElement('canvas');
    const patternContext = patternCanvas.getContext('2d');
    patternCanvas.width = 16;
    patternCanvas.height = 16;

    if (patternContext) {
        // Base gray
        patternContext.fillStyle = '#F5F7FA';
        patternContext.fillRect(0, 0, 16, 16);
        
        // Stripe line
        patternContext.strokeStyle = '#D1D5DB';
        patternContext.lineWidth = 4;
        patternContext.beginPath();
        patternContext.moveTo(0, 16);
        patternContext.lineTo(16, 0);
        patternContext.stroke();
        
        patternContext.beginPath();
        patternContext.moveTo(-4, 4);
        patternContext.lineTo(4, -4);
        patternContext.stroke();
        
        patternContext.beginPath();
        patternContext.moveTo(12, 20);
        patternContext.lineTo(20, 12);
        patternContext.stroke();
    }
    
    return ctx.createPattern(patternCanvas, 'repeat');
  }

  /** Metodo initChart */
    initChart() {
    if (!this.envChartRef) return;
    const ctx = this.envChartRef.nativeElement.getContext('2d');
    if (this.chartInstance) this.chartInstance.destroy();

    this.chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Produzione', 'Collaudo', 'Sviluppo', 'Altro', 'Dismessa'],
            datasets: [{
                data: [
                    this.prodHosts, 
                    this.collHosts, 
                    this.devHosts, 
                    this.totalHosts - this.prodHosts - this.collHosts - this.devHosts - this.dismesseHosts,
                    this.dismesseHosts
                ],
                backgroundColor: ['#0078D4', '#8764B8', '#00B7C3', this.createStripedPattern(ctx), '#8A8886'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#242424', font: { family: "'Segoe UI', sans-serif" } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context: any) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                let total = context.chart._metasets[context.datasetIndex].total;
                                let percent = Math.round((context.parsed / total) * 100);
                                label += percent + '% (' + context.parsed + ')';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });

    // Services Chart
    if (this.servicesChartRef) {
        const sCtx = this.servicesChartRef.nativeElement.getContext('2d');
        if (this.servicesChartInstance) this.servicesChartInstance.destroy();
        this.servicesChartInstance = new Chart(sCtx, {
            type: 'bar',
            data: {
                labels: ['Full', 'Limited', 'Absent'],
                datasets: [{
                    label: 'Knowledge Servizi',
                    data: [this.servicesStats.full, this.servicesStats.limited, this.servicesStats.absent],
                    backgroundColor: ['#107C10', '#986F0B', '#A4262C'],
                    borderRadius: 20,
                    barThickness: 12,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { right: 40 } // space for the label
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context: any) {
                                return context.parsed.x + ' Servizi';
                            }
                        }
                    }
                },
                scales: {
                    x: { display: false, beginAtZero: true },
                    y: { ticks: { color: '#242424', font: { family: "'Segoe UI', sans-serif", size: 14, weight: 'bold' } }, grid: { display: false } }
                }
            },
            plugins: [{
                id: 'customDatalabels',
                afterDatasetsDraw: function(chart: any) {
                    const ctx = chart.ctx;
                    chart.data.datasets.forEach(function(dataset: any, i: number) {
                        const meta = chart.getDatasetMeta(i);
                        if (!meta.hidden) {
                            meta.data.forEach(function(element: any, index: number) {
                                ctx.fillStyle = '#242424';
                                const fontSize = 14;
                                const fontStyle = 'bold';
                                const fontFamily = "'Segoe UI', sans-serif";
                                ctx.font = Chart.helpers.fontString(fontSize, fontStyle, fontFamily);
                                const dataString = dataset.data[index].toString();
                                ctx.textAlign = 'left';
                                ctx.textBaseline = 'middle';
                                const position = element.tooltipPosition();
                                ctx.fillText(dataString, position.x + 10, position.y);
                            });
                        }
                    });
                }
            }]
        });
    }

    // Sites Chart
    if (this.sitesChartRef) {
        const stCtx = this.sitesChartRef.nativeElement.getContext('2d');
        if (this.sitesChartInstance) this.sitesChartInstance.destroy();
        this.sitesChartInstance = new Chart(stCtx, {
            type: 'polarArea',
            data: {
                labels: ['Produzione', 'Collaudo', 'Sviluppo'],
                datasets: [{
                    label: 'Siti in Carico',
                    data: [this.sitesStats.prod, this.sitesStats.coll, this.sitesStats.dev],
                    backgroundColor: [
                        'rgba(0, 120, 212, 0.7)',
                        'rgba(135, 100, 184, 0.7)',
                        'rgba(0, 183, 195, 0.7)'
                    ],
                    borderColor: ['#0078D4', '#8764B8', '#00B7C3'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right',
                        labels: { color: '#242424', font: { family: "'Segoe UI', sans-serif" } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context: any) {
                                return context.parsed.r + ' Siti';
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        ticks: { display: false }, // hide internal numbers
                        grid: { color: 'rgba(36, 36, 36, 0.12)' },
                        angleLines: { color: 'rgba(36, 36, 36, 0.12)' }
                    }
                }
            }
        });
    }
  }
}
