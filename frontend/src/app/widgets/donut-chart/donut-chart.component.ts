import { Component, computed, input } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { EChartsOption } from 'echarts';

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [NgxEchartsModule],
  templateUrl: './donut-chart.component.html',
  styleUrls: ['./donut-chart.component.scss'],
})
export class DonutChartComponent {
  data = input<DonutChartItem[]>([]);
  total = input<number>(0);

  chartOption = computed<EChartsOption>(() => {
    const items = this.data();

    return {
      color: items.map(item => item.color),

      tooltip: {
        trigger: 'item',
        formatter: (params: any) =>
          `${params.name}: ${params.value}%`,
      },

      series: [
        {
          type: 'pie',
          radius: ['68%', '86%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          data: items.map(item => ({
            name: item.label,
            value: item.value,
          })),
        },
      ],
    };
  });

  formattedTotal = computed(() =>
    this.total().toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );

  totalFontSize = computed(() => {
    const length = this.formattedTotal().length;
  
    if (length <= 9) return 30;
    if (length <= 11) return 26;
    if (length <= 13) return 22;
    return 18;
  });
}