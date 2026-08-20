import * as React from "react";
import type { MenuItem } from "../hooks/use-menu.js";

export interface SidebarNavProps {
  items: MenuItem[];
  onSelect: (id: NonNullable<MenuItem["id"]>) => void;
}

export function SidebarNav(props: SidebarNavProps): React.ReactElement {
  return (
    <nav className="cb-kit-sidebar" aria-label="Platform navigation">
      {props.items.map((item) => {
        if (item.type !== "ITEM" || !item.id) return null;
        return (
          <button
            key={item.id}
            type="button"
            className={`cb-kit-nav-item${item.selected ? " active" : ""}${item.restricted ? " restricted" : ""}`}
            onClick={() => props.onSelect(item.id!)}
            title={item.restricted ? item.label : undefined}
          >
            {item.selected ? item.iconActive ?? item.icon : item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
