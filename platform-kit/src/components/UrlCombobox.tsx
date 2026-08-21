import * as React from "react";
import type { AccessEndpoint } from "../core/types.js";
import { hostFromUrl } from "../services/apps-access.js";

export interface UrlComboboxProps {
  value: string;
  options: AccessEndpoint[];
  placeholder?: string;
  selectLabel?: string;
  onChange: (value: string) => void;
  onSelect: (endpoint: AccessEndpoint) => void;
  onSubmit?: () => void;
}

export function UrlCombobox(props: UrlComboboxProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = props.options.filter((item) => {
    const q = props.value.trim().toLowerCase();
    if (!q) return true;
    return (
      item.label.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      hostFromUrl(item.url).toLowerCase().includes(q)
    );
  });

  return (
    <div className="cb-kit-combobox" ref={rootRef}>
      <input
        type="text"
        className="cb-kit-combobox-input"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            props.onSubmit?.();
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        spellCheck={false}
        aria-label={props.selectLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      />
      <button
        type="button"
        className="cb-kit-combobox-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={props.selectLabel}
      >
        ▾
      </button>
      {open && filtered.length > 0 ? (
        <div className="cb-kit-combobox-menu" role="listbox">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              className={`cb-kit-combobox-option${props.value === item.url ? " active" : ""}`}
              onClick={() => {
                props.onChange(item.url);
                props.onSelect(item);
                setOpen(false);
              }}
            >
              <span className="tag">{item.resourceType}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div className="label">{item.label}</div>
                <div className="sub">{hostFromUrl(item.url)}</div>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
