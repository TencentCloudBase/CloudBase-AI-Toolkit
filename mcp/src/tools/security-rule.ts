import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { successResult, toMCPResponse } from "../utils/response-builder.js";

/**
 * 权限类别（AclTag）
 * - READONLY：所有用户可读，仅创建者和管理员可写
 * - PRIVATE：仅创建者及管理员可读写
 * - ADMINWRITE：所有用户可读，仅管理员可写
 * - ADMINONLY：仅管理员可读写
 * - CUSTOM：自定义安全规则（需传 rule 字段）
 */
export type AclTag =
  | "READONLY"
  | "PRIVATE"
  | "ADMINWRITE"
  | "ADMINONLY"
  | "CUSTOM";

/**
 * 资源类型（resourceType）
 * - database：数据库集合
 * - function：云函数
 * - storage：存储桶
 */
export type ResourceType = "database" | "function" | "storage";

/**
 * 读取安全规则参数
 */
export interface ReadSecurityRuleParams {
  resourceType: ResourceType;
  resourceId: string;
}

/**
 * 写入安全规则参数
 */
export interface WriteSecurityRuleParams {
  resourceType: ResourceType;
  resourceId: string;
  aclTag: AclTag;
  rule?: string;
}

export const READ_SECURITY_RULE = "readSecurityRule";
export const WRITE_SECURITY_RULE = "writeSecurityRule";

/**
 * 注册安全规则相关 Tool
 * @param server MCP Server 实例
 */
export function registerSecurityRuleTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // 读取安全规则 Tool
  server.registerTool?.(
    READ_SECURITY_RULE,
    {
      title: "读取安全规则",
      description: `读取指定资源（noSQL 数据库、SQL 数据库、云函数、存储桶）的安全规则和权限类别。`,
      inputSchema: {
        resourceType: z
          .enum(["noSqlDatabase", "sqlDatabase", "function", "storage"])
          .describe(
            "资源类型：noSqlDatabase=noSQL 数据库，sqlDatabase=SQL 数据库，function=云函数，storage=存储桶",
          ),
        resourceId: z
          .string()
          .describe(
            "资源唯一标识。noSQL 数据库为集合名，SQL 数据库为表名，云函数为函数名，存储为桶名（完整格式如 '6169-xxx-1257473911'，可通过 envQuery action=info 获取 EnvInfo.Storages[].Bucket）。",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "security-rule",
      },
    },
    async ({ resourceType, resourceId }) => {
      const envId = await getEnvId(cloudBaseOptions);
      const cloudbase = await getManager();
      let result;
      if (resourceType === "noSqlDatabase") {
        result = await cloudbase.commonService().call({
          Action: "DescribeSafeRule",
          Param: {
            CollectionName: resourceId,
            EnvId: envId,
          },
        });
        logCloudBaseResult(server.logger, result);
      } else if (resourceType === "function") {
        result = await cloudbase.commonService().call({
          Action: "DescribeSecurityRule",
          Param: {
            ResourceType: "FUNCTION",
            EnvId: envId,
          },
        });
        logCloudBaseResult(server.logger, result);
      } else if (resourceType === "storage") {
        result = await cloudbase.commonService().call({
          Action: "DescribeStorageSafeRule",
          Param: {
            Bucket: resourceId,
            EnvId: envId,
          },
        });
        logCloudBaseResult(server.logger, result);
      } else if (resourceType === "sqlDatabase") {
        const instanceId = "default";
        const schema = envId;
        const tableName = resourceId;

        result = await cloudbase.commonService("lowcode").call({
          Action: "DescribeDataSourceBasicPolicy",
          Param: {
            EnvId: envId,
            ResourceType: "table",
            ResourceId: `${instanceId}#${schema}#${tableName}`,
            RoleIdentityList: ["allUser"],
          },
        });
        logCloudBaseResult(server.logger, result);
      } else {
        throw new Error(`不支持的资源类型: ${resourceType}`);
      }
      return toMCPResponse(successResult(
        {
          resourceType,
          resourceId,
          aclTag: result.AclTag,
          rule: result.Rule ?? null,
          raw: result,
        },
        "安全规则读取成功"
        // No nextActions - simple read-only query
      ));
    },
  );

  // 写入安全规则 Tool
  server.registerTool?.(
    WRITE_SECURITY_RULE,
    {
      title: "写入安全规则",
      description: `设置指定资源（数据库集合、云函数、存储桶）的安全规则。`,
      inputSchema: {
        resourceType: z
          .enum(["sqlDatabase", "noSqlDatabase", "function", "storage"])
          .describe(
            "资源类型：sqlDatabase=SQL 数据库，noSqlDatabase=noSQL 数据库，function=云函数，storage=存储桶",
          ),
        resourceId: z
          .string()
          .describe(
            "资源唯一标识。sqlDatabase=表名，noSqlDatabase=集合名，云函数为函数名，存储为桶名（完整格式如 '6169-xxx-1257473911'，可通过 envQuery action=info 获取 EnvInfo.Storages[].Bucket）。",
          ),
        aclTag: z
          .enum(["READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"])
          .describe("权限类别"),
        rule: z
          .string()
          .optional()
          .describe("自定义安全规则内容，仅当 aclTag 为 CUSTOM 时必填"),
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        category: "security-rule",
      },
    },
    async ({ resourceType, resourceId, aclTag, rule }) => {
      const cloudbase = await getManager();
      const envId = await getEnvId(cloudBaseOptions);
      let result;
      if (resourceType === "noSqlDatabase") {
        if (aclTag === "CUSTOM") {
          if (!rule)
            throw new Error(
              "noSQL 数据库自定义安全规则（CUSTOM）必须提供 rule 字段",
            );
          result = await cloudbase.commonService().call({
            Action: "ModifySafeRule",
            Param: {
              CollectionName: resourceId,
              EnvId: envId,
              AclTag: aclTag,
              Rule: rule,
            },
          });
          logCloudBaseResult(server.logger, result);
        } else {
          result = await cloudbase.commonService().call({
            Action: "ModifyDatabaseACL",
            Param: {
              CollectionName: resourceId,
              EnvId: envId,
              AclTag: aclTag,
            },
          });
          logCloudBaseResult(server.logger, result);
        }
      } else if (resourceType === "function") {
        if (aclTag !== "CUSTOM")
          throw new Error("云函数安全规则仅支持 CUSTOM 权限类别");
        if (!rule)
          throw new Error("云函数自定义安全规则（CUSTOM）必须提供 rule 字段");
        result = await cloudbase.commonService().call({
          Action: "ModifySecurityRule",
          Param: {
            AclTag: aclTag,
            EnvId: envId,
            ResourceType: "FUNCTION",
            Rule: rule,
          },
        });
        logCloudBaseResult(server.logger, result);
      } else if (resourceType === "storage") {
        if (aclTag === "CUSTOM") {
          if (!rule)
            throw new Error("存储自定义安全规则（CUSTOM）必须提供 rule 字段");
          result = await cloudbase.commonService().call({
            Action: "ModifyStorageSafeRule",
            Param: {
              Bucket: resourceId,
              EnvId: envId,
              AclTag: aclTag,
              Rule: rule,
            },
          });
          logCloudBaseResult(server.logger, result);
        } else {
          result = await cloudbase.commonService().call({
            Action: "ModifyStorageSafeRule",
            Param: {
              Bucket: resourceId,
              EnvId: envId,
              AclTag: aclTag,
            },
          });
          logCloudBaseResult(server.logger, result);
        }
      } else if (resourceType === "sqlDatabase") {
        if (aclTag === "CUSTOM") {
          throw new Error("SQL 数据库不支持自定义安全规则（CUSTOM）");
        }

        const schema = envId;
        const tableName = resourceId;
        const instanceId = "default";
        const resource = `${instanceId}#${schema}#${tableName}`;
        const resourceType = "table";
        const effect = "allow";

        const policyList = [
          "allUser",
          "anonymousUser",
          "externalUser",
          "internalUser",
        ].map((roleIdentity) => ({
          RoleIdentity: roleIdentity,
          ResourceType: resourceType,
          ResourceId: resource,
          RowPermission: [] as ReturnType<typeof getRowPermission>,
          Effect: effect,
        }));

        policyList[0].RowPermission = getRowPermission(aclTag);

        result = await cloudbase.commonService("lowcode").call({
          Action: "BatchCreateResourcePolicy",
          Param: {
            EnvId: envId,
            PolicyList: policyList,
          },
        });
        logCloudBaseResult(server.logger, result);

        function getRowPermission(
          policy: "READONLY" | "PRIVATE" | "ADMINWRITE" | "ADMINONLY",
        ) {
          return {
            READONLY: [
              { Key: "all", Value: "r" },
              { Key: "me", Value: "rw" },
            ],
            PRIVATE: [{ Key: "me", Value: "rw" }],
            ADMINWRITE: [{ Key: "all", Value: "r" }],
            ADMINONLY: [],
          }[policy];
        }
      } else {
        throw new Error(`不支持的资源类型: ${resourceType}`);
      }
      return toMCPResponse(successResult(
        {
          requestId: result.RequestId,
          raw: result,
        },
        "安全规则写入成功"
        // No nextActions - complete operation
      ));
    },
  );
}
