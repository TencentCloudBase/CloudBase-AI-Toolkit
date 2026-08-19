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
  /** dsh client runtime 提供的 Typert Remote 命名空间访问。 */
  remote?: {
    cloudbaseData?: CloudBaseData;
  };
  /** 兼容旧注入路径（服务端 provide 裸对象，跨进程不可见，已废弃）。 */
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

/** Register a toolview keyed by tool name; component receives tool block props. */
export function registerToolViewSlot(
  ctx: SlotHost,
  toolName: string,
  component: unknown,
): void {
  registerKeyedSlot(ctx, "tool.call.toolview", toolName, component);
  registerKeyedSlot(ctx, "tool.call.toolview", `mcp__cloudbase__${toolName}`, component);
}

export function registerNamedSlot(
  ctx: SlotHost,
  slotName: string,
  id: string,
  component: unknown,
  options?: { select?: (owner: unknown) => unknown; priority?: number },
): void {
  const run = () =>
    ctx.slots?.register?.(
      {
        name: slotName,
        id,
        order: 40,
        label: "CloudBase",
        ...(options?.select ? { select: options.select } : {}),
        ...(options?.priority !== undefined ? { priority: options.priority } : {}),
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
