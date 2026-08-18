import type { CloudBaseData } from "../../shared/types.js";

export interface SlotHost {
  slots?: {
    inject?: (name: string, factory: () => unknown) => unknown;
    register?: (meta: Record<string, unknown>, component: unknown) => unknown;
  };
  layout?: {
    openDetails?: () => void;
    closeDetails?: () => void;
  };
  cloudbaseData?: CloudBaseData;
}

export function registerKeyedSlot(
  ctx: SlotHost,
  slotName: string,
  key: string,
  component: unknown,
): void {
  const run = () =>
    ctx.slots?.register?.(
      {
        name: slotName,
        key,
        id: `cloudbase-${slotName}-${key}`,
      },
      component,
    );
  if (typeof ctx.slots?.inject === "function") {
    ctx.slots.inject(slotName, run);
    return;
  }
  run();
}

export function registerNamedSlot(
  ctx: SlotHost,
  slotName: string,
  id: string,
  component: unknown,
): void {
  const run = () =>
    ctx.slots?.register?.(
      {
        name: slotName,
        id,
        order: 40,
        label: "CloudBase",
      },
      component,
    );
  if (typeof ctx.slots?.inject === "function") {
    ctx.slots.inject(slotName, run);
    return;
  }
  run();
}

export function openDetails(ctx: SlotHost): void {
  ctx.layout?.openDetails?.();
}
