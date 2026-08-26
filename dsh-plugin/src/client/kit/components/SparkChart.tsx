import * as React from "react";

export interface SparkChartProps {
  points: number[];
  danger?: boolean;
  width?: number;
  height?: number;
}

/** SVG sparkline used by analytics and user-growth charts. */
export function SparkChart(props: SparkChartProps): React.ReactElement {
  const width = props.width ?? 120;
  const height = props.height ?? 36;
  const points = props.points.length > 1 ? props.points : [0, 0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const coords = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - 4 - ((value - min) / span) * (height - 8);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="cb-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline
        points={coords}
        fill="none"
        stroke={props.danger ? "#cf222e" : "#16181d"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
