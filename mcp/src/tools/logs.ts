import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { t } from "../i18n/index.js";

const QUERY_LOG_ACTIONS = ["checkLogService", "searchLogs"] as const;

type QueryLogAction = (typeof QUERY_LOG_ACTIONS)[number];

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

function buildEnvelope(data: Record<string, unknown>, message: string): ToolEnvelope {
  return {
    success: true,
    data,
    message,
  };
}

function buildErrorEnvelope(error: unknown): ToolEnvelope {
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
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
}
