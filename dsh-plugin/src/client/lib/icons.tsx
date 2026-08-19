import * as React from "react";

type IconProps = { size?: number };

function Svg(props: IconProps & { children: React.ReactNode }): React.ReactElement {
  const size = props.size ?? 14;
  return React.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    props.children,
  );
}

export const IconTable = () =>
  Svg({ children: React.createElement("path", { d: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM9 3v18" }) });
export const IconCheck = () =>
  Svg({ children: React.createElement("path", { d: "M20 6L9 17l-5-5" }) });
export const IconCopy = () =>
  Svg({
    children: [
      React.createElement("rect", { key: "a", x: "9", y: "9", width: "13", height: "13", rx: "2" }),
      React.createElement("path", { key: "b", d: "M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" }),
    ],
  });
export const IconDownload = () =>
  Svg({ children: React.createElement("path", { d: "M12 3v12M7 10l5 5 5-5M5 21h14" }) });
export const IconExternal = () =>
  Svg({ children: React.createElement("path", { d: "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" }) });
export const IconFile = () =>
  Svg({
    children: [
      React.createElement("path", { key: "a", d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" }),
      React.createElement("path", { key: "b", d: "M14 2v6h6" }),
    ],
  });
export const IconDb = () =>
  Svg({
    children: [
      React.createElement("ellipse", { key: "a", cx: "12", cy: "5", rx: "9", ry: "3" }),
      React.createElement("path", { key: "b", d: "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" }),
    ],
  });
export const IconFolder = () =>
  Svg({ children: React.createElement("path", { d: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" }) });
export const IconLock = () =>
  Svg({
    children: [
      React.createElement("rect", { key: "a", x: "3", y: "11", width: "18", height: "11", rx: "2" }),
      React.createElement("path", { key: "b", d: "M7 11V7a5 5 0 0110 0v4" }),
    ],
  });
export const IconGear = () =>
  Svg({
    children: [
      React.createElement("circle", { key: "a", cx: "12", cy: "12", r: "3" }),
      React.createElement("path", {
        key: "b",
        d: "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
      }),
    ],
  });
export const IconChart = () =>
  Svg({ children: React.createElement("path", { d: "M3 3v18h18M8 17v-5M13 17V7M18 17v-8" }) });
export const IconSql = () =>
  Svg({ children: React.createElement("path", { d: "M4 17l6-6-6-6M12 19h8" }) });
export const IconPlus = () =>
  Svg({ children: React.createElement("path", { d: "M12 5v14M5 12h14" }) });
export const IconPlay = () =>
  Svg({ children: React.createElement("path", { d: "M8 5v14l11-7z", fill: "currentColor", stroke: "none" }) });
export const IconWarn = () =>
  Svg({
    children: [
      React.createElement("path", { key: "a", d: "M12 9v4M12 17h.01" }),
      React.createElement("path", { key: "b", d: "M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" }),
    ],
  });
export const IconChevron = ({ dir }: { dir: "left" | "right" }) =>
  Svg({ children: React.createElement("path", { d: dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6" }) });
export const IconBrowser = () =>
  Svg({
    children: [
      React.createElement("rect", { key: "a", x: "3", y: "4", width: "18", height: "16", rx: "2" }),
      React.createElement("path", { key: "b", d: "M3 9h18" }),
      React.createElement("circle", { key: "c", cx: "6.5", cy: "6.5", r: "0.5", fill: "currentColor" }),
      React.createElement("circle", { key: "d", cx: "9", cy: "6.5", r: "0.5", fill: "currentColor" }),
    ],
  });
export const IconRefresh = () =>
  Svg({
    children: [
      React.createElement("path", {
        key: "a",
        d: "M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5",
      }),
    ],
  });
export const IconOpen = () =>
  Svg({
    children: [
      React.createElement("path", { key: "a", d: "M14 3h7v7M10 14L21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" }),
    ],
  });
export const IconGithub = () =>
  Svg({
    children: [
      React.createElement("path", {
        key: "a",
        d: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
      }),
    ],
  });
/** CloudBase 品牌 logo：蓝色圆角底 + 白色云朵（简约版）。 */
export const IconCloudBase = () =>
  Svg({
    children: [
      React.createElement("path", {
        key: "a",
        d: "M7.5 18.5a4 4 0 01-.5-7.97A5.5 5.5 0 0118 9.5a3.8 3.8 0 01.5 7.57",
        fill: "#4c8dff",
        stroke: "#4c8dff",
        strokeWidth: "1.4",
        strokeLinejoin: "round",
      }),
      React.createElement("path", {
        key: "b",
        d: "M9.8 15.2l2.4-2.9 1.7 1.5 2.3-2.6",
        fill: "none",
        stroke: "#fff",
        strokeWidth: "1.5",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    ],
  });
