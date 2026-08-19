import * as React from "react";
import type { LogEntry, TableSummary } from "../../../shared/types.js";
import { buildSuggestions, type SuggestionItem } from "../../../shared/kit-insights.js";

export type { SuggestionItem };
export { buildSuggestions };

export interface SuggestionsPanelProps {
  tables: TableSummary[];
  errors: LogEntry[];
}

export function SuggestionsPanel(props: SuggestionsPanelProps): React.ReactElement {
  const items = buildSuggestions(props);
  return (
    <div>
      <div className="cb-tree-sec">AI 建议</div>
      <div className="cb-env-list" style={{ paddingTop: 4 }}>
        {items.map((item) => (
          <div className="cb-env-row" key={item.title}>
            <span className="k">{item.title}</span>
            <span className="v">{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
