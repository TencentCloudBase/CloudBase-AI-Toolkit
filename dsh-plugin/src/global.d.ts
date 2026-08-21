export {};

declare global {
  interface Window {
    __ModuleLoader__?: {
      load: (entry: { id: string; factory: (require: NodeRequire, module: unknown, exports: unknown) => unknown }) => void;
    };
  }
}
