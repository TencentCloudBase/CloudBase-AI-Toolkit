import * as React from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sql } from "@codemirror/lang-sql";

export interface SqlEditorProps {
  value: string;
  onChange: (sql: string) => void;
  /** Cmd/Ctrl+Enter runs the current SQL. */
  onRun?: () => void;
}

export function SqlEditor(props: SqlEditorProps): React.ReactElement {
  const parent = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(props.onChange);
  const onRunRef = React.useRef(props.onRun);
  onChangeRef.current = props.onChange;
  onRunRef.current = props.onRun;

  React.useEffect(() => {
    if (!parent.current) return;
    const state = EditorState.create({
      doc: props.value,
      extensions: [
        lineNumbers(),
        history(),
        sql(),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRunRef.current?.();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12.5px", background: "#fcfcfc" },
          ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
        }),
      ],
    });
    const view = new EditorView({ state, parent: parent.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; later value sync is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== props.value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.value },
      });
    }
  }, [props.value]);

  return <div className="cb-sql" ref={parent} />;
}
