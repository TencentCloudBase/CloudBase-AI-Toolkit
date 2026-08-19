import * as React from "react";
import type { AppUser } from "../../../shared/types.js";
import { bucketUserGrowth } from "../../../shared/kit-insights.js";
import { SparkChart } from "./SparkChart.js";

export { bucketUserGrowth };

export interface UsersGrowthChartProps {
  users: AppUser[];
  days?: number;
}

export function UsersGrowthChart(props: UsersGrowthChartProps): React.ReactElement {
  const points = bucketUserGrowth(props.users, props.days ?? 14);
  const latest = points[points.length - 1] ?? 0;
  return (
    <div className="cb-chart-card">
      <div className="cb-chart-head">
        <span>用户增长</span>
        <span className="cb-spacer" />
        <span style={{ fontFamily: "var(--cb-mono)" }}>{latest}</span>
      </div>
      <SparkChart points={points} width={240} height={48} />
    </div>
  );
}
