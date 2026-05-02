import { Component, computed, input } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { EChartsOption } from 'echarts';

export interface LineChartPoint {
  label: string;
  value: number;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [NgxEchartsModule],
  templateUrl: './line-chart.component.html',
  styleUrls: ['./line-chart.component.scss'],
})
export class LineChartComponent {

  // ✅ במקום @Input
  data = input<LineChartPoint[]>([]);

  // ✅ במקום ngOnChanges
  chartOption = computed<EChartsOption>(() => {
    const d = this.data();

    return {
      grid: {
        // containLabel: true shrinks the plot area to fit axis labels inside
        // the container — prevents X-axis labels from clipping at the edges
        // and keeps Y-axis labels (right-positioned) from overflowing.
        containLabel: true,
        left: 8,
        right: 8,
        top: 20,
        bottom: 0,
      },

      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => `₪ ${Number(value).toLocaleString('he-IL')}`,
      },

      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: d.map(item => item.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { margin: 8, color: '#8F8F8F', fontSize: 11 },
      },

      yAxis: {
        type: 'value',
        position: 'right',
        min: 0,
        max: 30000,
        interval: 5000,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#8F8F8F',
          fontSize: 11,
          // margin: distance between the label text and the plot edge
          margin: 4,
          formatter: (value: number) => value.toLocaleString('he-IL'),
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#EEEEEE' },
        },
      },

      series: [
        {
          type: 'line',
          data: d.map(item => item.value),
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: '#6C63FF',
            width: 2,
            shadowColor: 'rgba(108, 99, 255, 0.75)',
            shadowBlur: 8,
            shadowOffsetY: 6
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(108, 99, 255, 0.1)' },
                { offset: 1, color: 'rgba(108, 99, 255, 0.1)' }
              ]
            }
          }
        },
      ],
    };
  });
}