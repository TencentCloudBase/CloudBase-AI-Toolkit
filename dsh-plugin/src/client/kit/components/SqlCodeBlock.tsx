import * as React from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import { IconCopy } from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";

export interface SqlCodeBlockProps {
  sql: string;
  /** CodeMirror language extension; defaults to SQL. */
  language?: "sql" | "json";
  maxHeight?: number;
}

export function SqlCodeBlock(props: SqlCodeBlockProps): React.ReactElement {
  ensureStyles();
  const parent = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const [copied, setCopied] = React.useState(false);
  const lang = props.language ?? "sql";
  const maxHeight = props.maxHeight ?? 280;

  React.useEffect(() => {
    if (!parent.current) return;
    const langExt = lang === "json" ? [] : [sql()];
    const state = EditorState.create({
      doc: props.sql,
      extensions: [
        lineNumbers(),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        ...langExt,
        EditorView.theme({
          "&": {
            maxHeight: `${maxHeight}px`,
            fontSize: "12.5px",
            background: "#fcfcfc",
          },
          ".cm-scroller": {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            overflow: "auto",
          },
          ".cm-gutters": {
            background: "#f6f6f5",
            borderRight: "1px solid #ececec",
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: parent.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, maxHeight]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== props.sql) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.sql },
      });
    }
  }, [props.sql]);

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(props.sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="cb-sql-block">
      <div className="cb-sql-block-bar">
        <span className="cb-sql-block-lang">{lang.toUpperCase()}</span>
        <span className="cb-spacer" />
        <button className="cb-copy" type="button" onClick={() => void copySql()} aria-label="Copy SQL">
          <IconCopy />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="cb-sql-block-body" ref={parent} />
    </div>
  );
}
