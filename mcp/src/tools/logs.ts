import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { t } from "../i18n/index.js";

const QUERY_LOG_ACTIONS = ["checkLogService", "searchLogs"] as const;
const MANAGE_LOG_ACTIONS = ["createLogService"] as const;

type QueryLogAction = (typeof QUERY_LOG_ACTIONS)[number];
type ManageLogAction = (typeof MANAGE_LOG_ACTIONS)[number];

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
  errorCode?: string;
  nextActions?: Array<{
    tool: string;
    action: string;
    suggested_args?: Record<string, unknown>;
    reason?: string;
  }>;
};

function buildEnvelope(
  data: Record<string, unknown>,
  message: string,
  extras?: Pick<ToolEnvelope, "errorCode" | "nextActions">,
): ToolEnvelope {
  return {
    success: true,
    data,
    message,
    ...extras,
  };
}

function buildErrorEnvelope(
  error: unknown,
  extras?: Partial<ToolEnvelope>,
): ToolEnvelope {
  return {
    success: false,
    data: extras?.data ?? {},
    message:
      extras?.message ??
      (error instanceof Error ? error.message : String(error)),
    errorCode: extras?.errorCode,
    nextActions: extras?.nextActions,
  };
}

export function registerLogTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "queryLogs",
    {
      title: "logs.title",
      description: "logs.description",
      inputSchema: {
        action: z
          .enum(QUERY_LOG_ACTIONS)
          .describe("logs.schema.action"),
        queryString: z
          .string()
          .optional()
          .describe("logs.schema.queryString"),
        service: z
          .enum(["tcb", "tcbr"])
          .optional()
          .describe("logs.schema.service"),
        startTime: z
          .string()
          .optional()
          .describe("logs.schema.startTime"),
        endTime: z
          .string()
          .optional()
          .describe("logs.schema.endTime"),
        limit: z.number().optional().describe("logs.schema.limit"),
        context: z.string().optional().describe("logs.schema.context"),
        sort: z.enum(["asc", "desc"]).optional().describe("logs.schema.sort"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        category: "logs",
      },
    },
    async ({
      action,
      queryString,
      service,
      startTime,
      endTime,
      limit,
      context,
      sort,
    }: {
      action: QueryLogAction;
      queryString?: string;
      service?: "tcb" | "tcbr";
      startTime?: string;
      endTime?: string;
      limit?: number;
      context?: string;
      sort?: "asc" | "desc";
    }) => {
      try {
        const cloudbase = await getManager();
        if (action === "checkLogService") {
          const enabled = await cloudbase.log.checkLogServiceEnabled();
          return jsonContent(
            buildEnvelope(
              {
                action,
                enabled,
              },
              enabled ? t("logs.serviceEnabled") : t("logs.serviceDisabled"),
            ),
          );
        }

        if (!queryString) {
          throw new Error(t("logs.missingQueryString"));
        }
        const result = await cloudbase.log.searchClsLog({
          queryString,
          StartTime: startTime ?? "1970-01-01 00:00:00",
          EndTime: endTime ?? "2099-12-31 23:59:59",
          Limit: limit ?? 20,
          Context: context,
          Sort: sort,
          service,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent(
          buildEnvelope(
            {
              action,
              queryString,
              results: result.LogResults ?? null,
              raw: result,
            },
            t("logs.searchSuccess"),
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  server.registerTool?.(
    "manageLogs",
    {
      title: "logs.manage.title",
      description: "logs.manage.description",
      inputSchema: {
        action: z
          .enum(MANAGE_LOG_ACTIONS)
          .describe("logs.manage.schema.action"),
        confirm: z
          .boolean()
          .optional()
          .describe("logs.manage.schema.confirm"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        category: "logs",
      },
    },
    async ({
      action,
      confirm,
    }: {
      action: ManageLogAction;
      confirm?: boolean;
    }) => {
      try {
        if (action !== "createLogService") {
          return jsonContent(
            buildErrorEnvelope(new Error(t("logs.manage.unsupportedAction", { action })), {
              errorCode: "UNSUPPORTED_ACTION",
            }),
          );
        }

        if (confirm !== true) {
          return jsonContent(
            buildErrorEnvelope(null, {
              errorCode: "CONFIRM_REQUIRED",
              message: t("logs.manage.create.confirmRequired"),
              data: { action },
              nextActions: [
                {
                  tool: "manageLogs",
                  action: "createLogService",
                  suggested_args: { action: "createLogService", confirm: true },
                  reason: t("logs.manage.create.needsConfirmation"),
                },
              ],
            }),
          );
        }

        const cloudbase = await getManager();
        const enabled = await cloudbase.log.checkLogServiceEnabled();
        if (enabled) {
          return jsonContent(
            buildEnvelope(
              {
                action,
                enabled: true,
                alreadyEnabled: true,
              },
              t("logs.manage.create.alreadyEnabled"),
              {
                nextActions: [
                  {
                    tool: "queryLogs",
                    action: "searchLogs",
                    suggested_args: {
                      action: "searchLogs",
                      queryString: 'log:"ERROR"',
                    },
                    reason: t("logs.manage.create.nextSearch"),
                  },
                ],
              },
            ),
          );
        }

        const result = await cloudbase.log.createLogService();
        logCloudBaseResult(server.logger, result);
        return jsonContent(
          buildEnvelope(
            {
              action,
              requestId: result.RequestId ?? null,
              raw: result,
            },
            t("logs.manage.create.submitted"),
            {
              nextActions: [
                {
                  tool: "queryLogs",
                  action: "checkLogService",
                  suggested_args: { action: "checkLogService" },
                  reason: t("logs.manage.create.nextCheck"),
                },
              ],
            },
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
