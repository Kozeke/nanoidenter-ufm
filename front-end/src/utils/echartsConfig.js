// Configured ECharts instance using modular API for tree-shaking optimization
// This avoids pulling in chart types/features that are never used
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Register only the components we actually use
echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export default echarts;

