declare module "react-dom/server" {
  import type * as React from "react";
  export function renderToStaticMarkup(element: React.ReactElement): string;
  export function renderToString(element: React.ReactElement): string;
}
