import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { READ_SECURITY_RULE, WRITE_SECURITY_RULE } from "./security-rule.js";
import { successResult, errorResult, toMCPResponse, buildNextAction, recommendDocs } from "../utils/response-builder.js";

const CATEGORY = "SQL database";

export function registerSQLDatabaseTools(server: ExtendedMcpServer) {
  // Get cloudBaseOptions, if not available then undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // Create closure function to get CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // executeReadOnlySQL
  server.registerTool?.(
    "executeReadOnlySQL",
    {
      title: "Execute read-only SQL query",
      description:
        "Execute a read-only SQL query on the SQL database. Note: For per-user ACL, each table should contain a fixed `_openid` column defined as `_openid VARCHAR(64) DEFAULT '' NOT NULL` that represents the user and is used for access control.",
      inputSchema: {
        sql: z.string().describe("SQL query statement (SELECT queries only)"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({ sql }) => {
      const cloudbase = await getManager();
      const envId = await getEnvId(cloudBaseOptions);

      const schemaId = envId;
      const instanceId = "default";

      const result = await cloudbase.commonService("tcb", "2018-06-08").call({
        Action: "RunSql",
        Param: {
          EnvId: envId,
          Sql: sql,
          DbInstance: {
            EnvId: envId,
            InstanceId: instanceId,
            Schema: schemaId,
          },
        },
      });
      logCloudBaseResult(server.logger, result);

      return toMCPResponse(successResult(
        result,
        "SQL query executed successfully"
        // No nextActions - simple read-only query
      ));
    },
  );

  // executeWriteSQL
  server.registerTool?.(
    "executeWriteSQL",
    {
      title: "Execute write SQL statement",
      description:
        "Execute a write SQL statement on the SQL database (INSERT, UPDATE, DELETE, etc.). Whenever you create a new table, you **must** include a fixed `_openid` column defined as `_openid VARCHAR(64) DEFAULT '' NOT NULL` that represents the user and is used for access control. Destructive operations (DROP, DELETE, TRUNCATE) require confirm=true.",
      inputSchema: {
        sql: z
          .string()
          .describe(
            "SQL statement (INSERT, UPDATE, DELETE, CREATE, ALTER, etc.)",
          ),
        confirm: z
          .boolean()
          .optional()
          .describe(
            "Confirmation flag for destructive operations (DROP, DELETE, TRUNCATE). Required for safety.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async ({ sql, confirm }) => {
      // Check for destructive operations
      const destructivePatterns = [
        /\bDROP\s+(TABLE|DATABASE|INDEX|VIEW)\b/i,
        /\bDELETE\s+FROM\b/i,
        /\bTRUNCATE\s+TABLE\b/i,
        /\bALTER\s+TABLE\s+\w+\s+DROP\b/i,
      ];

      const isDestructive = destructivePatterns.some(pattern => pattern.test(sql));

      if (isDestructive && !confirm) {
        // Error with nextActions: recommend docs + retry with confirm
        return toMCPResponse(errorResult(
          "Destructive SQL operation detected (DROP, DELETE, TRUNCATE). Please set confirm=true to proceed. This action cannot be undone.",
          null,
          [
            recommendDocs(
              'relational-database-tool',
              'Read the REQUIRED documentation to understand safe SQL execution and why confirm=true is needed',
              'high'
            ),
            buildNextAction(
              'executeWriteSQL',
              { sql, confirm: true },
              'Execute with confirm=true after understanding the implications from the documentation',
              'high'
            )
          ]
        ));
      }

      const cloudbase = await getManager();
      const envId = await getEnvId(cloudBaseOptions);

      const schemaId = envId;
      const instanceId = "default";

      const result = await cloudbase.commonService("tcb", "2018-06-08").call({
        Action: "RunSql",
        Param: {
          EnvId: envId,
          Sql: sql,
          DbInstance: {
            EnvId: envId,
            InstanceId: instanceId,
            Schema: schemaId,
          },
        },
      });
      logCloudBaseResult(server.logger, result);

      // Check if table was created - recommend security rule setup
      const isCreateTable = /\bCREATE\s+TABLE\b/i.test(sql);
      const nextActions = isCreateTable ? [
        buildNextAction(
          'readSecurityRule',
          { resourceType: 'mysql' },
          'Check current security rules for the newly created table',
          'high'
        ),
        buildNextAction(
          'writeSecurityRule',
          { resourceType: 'mysql' },
          'Set proper security rules for the newly created table to control access',
          'high'
        )
      ] : undefined;

      return toMCPResponse(successResult(
        result,
        isCreateTable
          ? `SQL statement executed successfully. Table created. Make sure to set proper security rules using readSecurityRule and writeSecurityRule tools.`
          : "SQL statement executed successfully",
        nextActions
      ));
    },
  );
}
