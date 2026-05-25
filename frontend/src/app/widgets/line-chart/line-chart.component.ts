import { Component, computed, input } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { EChartsOption } from 'echarts';

export interface LineChartPoint {
  label: string;
  value: number;
}

export interface LineChartSeries {
  name: string;
  color: string;
  data: LineChartPoint[];
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [NgxEchartsModule],
  templateUrl: './line-chart.component.html',
  styleUrls: ['./line-chart.component.scss'],
})
export class LineChartComponent {
  series    = input<LineChartSeries[]>([]);
  chartType = input<'line' | 'bar'>('line');

  chartOption = computed<EChartsOption>(() => {
    const allSeries = this.series();
    const type      = this.chartType();
    const labels    = allSeries[0]?.data.map(p => p.label) ?? [];
    const isSingle  = allSeries.length === 1;

    const isEmpty = allSeries.length === 0 ||
      allSeries.every(s => s.data.length === 0 || s.data.every(p => p.value === 0));

    const allValues = allSeries.flatMap(s => s.data.map(p => p.value));
    const maxVal    = allValues.length > 0 ? Math.max(...allValues) : 0;
    const yMax      = Math.ceil(maxVal * 1.2 / 5000) * 5000 || 10000;

    return {
      grid: {
        containLabel: true,
        left: 8,
        right: 8,
        top: 20,
        bottom: 25,
      },

      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => `₪ ${Number(value).toLocaleString('he-IL')}`,
      },

      legend: allSeries.length > 1
        ? { show: true, bottom: 0, right: 0, orient: 'horizontal', icon: 'circle', align: 'right',
           textStyle: { color: '#8F8F8F', fontSize: 11 } }
        : { show: false },

      xAxis: {
        type: 'category',
        boundaryGap: type === 'bar',
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { margin: 8, color: '#8F8F8F', fontSize: 11 },
      },

      yAxis: {
        type: 'value',
        position: 'right',
        min: 0,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#8F8F8F',
          fontSize: 11,
          margin: 4,
          formatter: (value: number) => value.toLocaleString('he-IL'),
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#EEEEEE' },
        },
      },

      graphic: isEmpty ? ({
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: 'אין נתונים עבור נתונים אלו',
          fontSize: 16,
          fontWeight: 500,
          fill: '#666',
        },
      } as any) : undefined,

      series: isEmpty ? [] : allSeries.map(s => {
        if (type === 'bar') {
          return {
            name: s.name,
            type: 'bar' as const,
            data: s.data.map(p => p.value),
            itemStyle: { color: s.color },
          };
        }
        return {
          name: s.name,
          type: 'line' as const,
          data: s.data.map(p => p.value),
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: s.color,
            width: 2,
            shadowColor: `${s.color}BF`,
            shadowBlur: 8,
            shadowOffsetY: 6,
          },
          ...(isSingle ? {
            areaStyle: {
              color: {
                type: 'linear' as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: `${s.color}1A` },
                  { offset: 1, color: `${s.color}1A` },
                ],
              },
            },
          } : {}),
        };
      }),
    };
  });
}
