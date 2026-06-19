import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAndInitTcbService } from "./env-setup.js";

vi.mock("../utils/logger.js", () => ({
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../utils/telemetry.js", () => ({
  telemetryReporter: {
    report: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../auth.js", () => ({
  getLoginState: vi.fn(),
}));

function createManager(call: ReturnType<typeof vi.fn>) {
  return {
    commonService: vi.fn(() => ({
      call,
    })),
  } as any;
}

describe("env-setup error classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should classify real-name auth errors from InitTcb", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        Initialized: false,
      })
      .mockRejectedValueOnce({
        code: "RealNameAuthRequired",
        message: "请先完成实名认证后再继续",
      });

    const result = await checkAndInitTcbService(createManager(call), {});

    expect(result).toMatchObject({
      checkTcbServiceAttempted: true,
      initTcbAttempted: true,
      tcbServiceInitialized: false,
      initTcbError: {
        code: "RealNameAuthRequired",
        message: "当前账号需要先完成实名认证",
        needRealNameAuth: true,
      },
    });
    expect(result.initTcbError?.actionText).toContain("实名认证");
  });

  it("should classify CloudBase activation errors from InitTcb", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        Initialized: false,
      })
      .mockRejectedValueOnce({
        code: "CamAuthRequired",
        message: "CAM not authorized, please activate CloudBase service first",
      });

    const result = await checkAndInitTcbService(createManager(call), {});

    expect(result).toMatchObject({
      checkTcbServiceAttempted: true,
      initTcbAttempted: true,
      tcbServiceInitialized: false,
      initTcbError: {
        code: "CamAuthRequired",
        message: "当前账号需要先开通 CloudBase 服务",
        needCamAuth: true,
      },
    });
    expect(result.initTcbError?.actionText).toContain("开通 CloudBase 服务");
  });
});
