import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";

// 导入Mermaid转换功能
let mermaidToJsonSchema: any = null;
let jsonSchemaToMermaid: any = null;

// 初始化Mermaid转换功能
function initializeMermaidTransform() {
  try {
    // 使用require来导入mermaid转换函数
    const mermaidTransform = require("@cloudbase/cals/lib/cjs/utils/mermaid-datasource/mermaid-json-transform");
    mermaidToJsonSchema = mermaidTransform.mermaidToJsonSchema;
    jsonSchemaToMermaid = mermaidTransform.jsonSchemaToMermaid;
  } catch (error) {
    console.warn(
      "Failed to import mermaid transform functions from @cloudbase/cals:",
      error
    );
  }
}

// 初始化导入
initializeMermaidTransform();

// Schema处理函数 - 根据用户提供的技术细节实现
function createBackendSchemaParams(schema: any) {
  const commonFields = {
    "x-kind": "tcb",
    "x-defaultMethods": [
      "wedaCreate",
      "wedaDelete",
      "wedaUpdate",
      "wedaGetItem",
      "wedaGetList",
      "wedaGetRecords",
      "wedaBatchCreate",
      "wedaBatchUpdate",
      "wedaBatchDelete",
    ],
    "x-primary-column": "_id",
  };

  // 处理schema中的属性
  if (schema.properties) {
    Object.values(schema.properties).forEach((property: any) => {
      if (property.format === "x-enum") {
        property.enum = undefined; // 不创建选项集，太重了
      }

      if (Array.isArray(property.default) && property.type !== "array") {
        if (
          property.default.length > 0 &&
          property.type === typeof property.default[0]
        ) {
          property.default = property.default[0];
        }
      }
    });
  }

  const result = Object.assign({}, commonFields, schema);
  return result;
}

// 递归解析字段结构的函数
function parseFieldStructure(
  field: any,
  fieldName: string,
  schema: any,
  depth: number = 0,
  maxDepth: number = 5
): any {
  if (depth > maxDepth) {
    return {
      name: fieldName,
      type: field.type,
      title: field.title || fieldName,
      description: field.description || "",
      error: "递归深度超限",
    };
  }

  const fieldInfo: any = {
    name: fieldName,
    type: field.type,
    format: field.format,
    title: field.title || fieldName,
    description: field.description || "",
    required: schema.required?.includes(fieldName) || false,
    depth: depth,
  };

  // 处理 array 类型字段
  if (field.type === "array" && field.items) {
    try {
      fieldInfo.items = parseFieldStructure(
        field.items,
        `${fieldName}_item`,
        schema,
        depth + 1,
        maxDepth
      );
    } catch (error: any) {
      fieldInfo.items = {
        name: `${fieldName}_item`,
        type: "unknown",
        title: "数组元素",
        description: "数组元素结构解析失败",
        error: error.message,
      };
    }
  }

  // 处理 object 类型字段
  if (field.type === "object" && field.properties) {
    try {
      fieldInfo.properties = Object.keys(field.properties).map((key) =>
        parseFieldStructure(
          field.properties[key],
          key,
          field,
          depth + 1,
          maxDepth
        )
      );
    } catch (error: any) {
      fieldInfo.properties = [
        {
          name: "property",
          type: "unknown",
          title: "对象属性",
          description: "对象属性结构解析失败",
          error: error.message,
        },
      ];
    }
  }

  // 处理关联关系
  if (field["x-parent"]) {
    fieldInfo.linkage = field["x-parent"];
  }

  // 添加其他属性
  if (field.enum) fieldInfo.enum = field.enum;
  if (field.default !== undefined) fieldInfo.default = field.default;

  return fieldInfo;
}

// 生成SDK使用文档的函数
function generateSDKDocs(
  modelName: string,
  modelTitle: string,
  userFields: any[],
  relations: any[]
): string {
  // 获取主要字段（前几个非关联字段）
  const mainFields = userFields.filter((f) => !f.linkage);
  const requiredFields = userFields.filter((f) => f.required);
  const stringFields = userFields.filter(
    (f) => f.type === "string" && !f.linkage
  );
  const numberFields = userFields.filter((f) => f.type === "number");

  // 生成字段示例值
  const generateFieldValue = (field: any): string => {
    if (field.enum && field.enum.length > 0) {
      return `"${field.enum[0]}"`;
    }
    switch (field.type) {
      case "string":
        return field.format === "email"
          ? '"user@example.com"'
          : field.format === "url"
            ? '"https://example.com"'
            : `"示例${field.title || field.name}"`;
      case "number":
        return field.format === "currency" ? "99.99" : "1";
      case "boolean":
        return field.default !== undefined ? field.default : "true";
      case "array":
        // 如果有子结构信息，生成更详细的示例
        if (field.items) {
          const itemValue = generateFieldValue(field.items);
          return `[${itemValue}]`;
        }
        return "[]";
      case "object":
        // 如果有子结构信息，生成更详细的示例
        if (field.properties && field.properties.length > 0) {
          const props = field.properties
            .slice(0, 2)
            .map((prop: any) => `${prop.name}: ${generateFieldValue(prop)}`)
            .join(", ");
          return `{${props}}`;
        }
        return "{}";
      default:
        return `"${field.title || field.name}值"`;
    }
  };

  // 生成创建数据示例
  const createDataExample = mainFields
    .map(
      (field) =>
        `    ${field.name}: ${generateFieldValue(field)}, // ${field.description || field.title || field.name
        }`
    )
    .join("\n");

  // 生成更新数据示例
  const updateDataExample = mainFields
    .slice(0, 2)
    .map(
      (field) =>
        `    ${field.name}: ${generateFieldValue(field)}, // ${field.description || field.title || field.name
        }`
    )
    .join("\n");

  // 生成查询条件示例
  const queryField = stringFields[0] || mainFields[0];
  const queryExample = queryField
    ? `      ${queryField.name}: {\n        $eq: ${generateFieldValue(
      queryField
    )}, // 根据${queryField.description || queryField.title || queryField.name
    }查询\n      },`
    : '      _id: {\n        $eq: "记录ID", // 根据ID查询\n      },';

  return `# 数据模型 ${modelTitle} (${modelName}) SDK 使用文档

## 数据模型字段说明

${userFields
      .map((field) => {
        let fieldDoc = `- **${field.name}** (${field.type})`;
        if (field.required) fieldDoc += " *必填*";
        if (field.description) fieldDoc += `: ${field.description}`;
        if (field.format) fieldDoc += ` [格式: ${field.format}]`;
        if (field.enum) fieldDoc += ` [可选值: ${field.enum.join(", ")}]`;
        if (field.default !== undefined) fieldDoc += ` [默认值: ${field.default}]`;

        // 添加复杂字段结构的说明
        if (field.type === "array" && field.items) {
          fieldDoc += `\n  - 数组元素: ${field.items.type}`;
          if (field.items.description) fieldDoc += ` (${field.items.description})`;
        }
        if (
          field.type === "object" &&
          field.properties &&
          field.properties.length > 0
        ) {
          fieldDoc += `\n  - 对象属性:`;
          field.properties.slice(0, 3).forEach((prop: any) => {
            fieldDoc += `\n    - ${prop.name} (${prop.type})`;
          });
          if (field.properties.length > 3) {
            fieldDoc += `\n    - ... 还有 ${field.properties.length - 3} 个属性`;
          }
        }

        return fieldDoc;
      })
      .join("\n")}

${relations.length > 0
      ? `
## 关联关系

${relations
        .map(
          (rel) =>
            `- **${rel.field}**: 关联到 ${rel.targetModel} 模型的 ${rel.foreignKey} 字段`
        )
        .join("\n")}
`
      : ""
    }

## 增删改查操作

### 创建数据

#### 创建单条数据 \`create\`

\`\`\`javascript
const { data } = await models.${modelName}.create({
  data: {
${createDataExample}
  },
});

// 返回创建的记录 id
console.log(data);
// { id: "7d8ff72c665eb6c30243b6313aa8539e"}
\`\`\`

#### 创建多条数据 \`createMany\`

\`\`\`javascript
const { data } = await models.${modelName}.createMany({
  data: [
    {
${createDataExample}
    },
    {
${createDataExample}
    },
  ],
});

// 返回创建的记录 idList
console.log(data);
// {
//   "idList": [
//       "7d8ff72c665ebe5c02442a1a7b29685e",
//       "7d8ff72c665ebe5c02442a1b77feba4b"
//   ]
// }
\`\`\`

### 更新数据

#### 更新单条数据 \`update\`

\`\`\`javascript
const { data } = await models.${modelName}.update({
  data: {
${updateDataExample}
  },
  filter: {
    where: {
      _id: {
        $eq: "记录ID", // 推荐传入_id数据标识进行操作
      },
    },
  },
});

// 返回更新成功的条数
console.log(data);
// { count: 1}
\`\`\`

#### 创建或更新数据 \`upsert\`

\`\`\`javascript
const recordData = {
${createDataExample}
  _id: "指定ID",
};

const { data } = await models.${modelName}.upsert({
  create: recordData,
  update: recordData,
  filter: {
    where: {
      _id: {
        $eq: recordData._id,
      },
    },
  },
});

console.log(data);
// 新增时返回: { "count": 0, "id": "指定ID" }
// 更新时返回: { "count": 1, "id": "" }
\`\`\`

#### 更新多条数据 \`updateMany\`

\`\`\`javascript
const { data } = await models.${modelName}.updateMany({
  data: {
${updateDataExample}
  },
  filter: {
    where: {
${queryExample}
    },
  },
});

// 返回更新成功的条数
console.log(data);
// { "count": 5 }
\`\`\`

### 删除数据

#### 删除单条 \`delete\`

\`\`\`javascript
const { data } = await models.${modelName}.delete({
  filter: {
    where: {
      _id: {
        $eq: "记录ID", // 推荐传入_id数据标识进行操作
      },
    },
  },
});

// 返回删除成功的条数
console.log(data);
// { "count": 1 }
\`\`\`

#### 删除多条 \`deleteMany\`

\`\`\`javascript
const { data } = await models.${modelName}.deleteMany({
  filter: {
    where: {
${queryExample}
    },
  },
});

// 返回删除成功的条数
console.log(data);
// { "count": 3 }
\`\`\`

### 读取数据

#### 读取单条数据 \`get\`

\`\`\`javascript
const { data } = await models.${modelName}.get({
  filter: {
    where: {
      _id: {
        $eq: "记录ID", // 推荐传入_id数据标识进行操作
      },
    },
  },
});

// 返回查询到的数据
console.log(data);
// {
//   "_id": "记录ID",
${userFields
      .slice(0, 5)
      .map(
        (field) =>
          `//   "${field.name}": ${generateFieldValue(field)}, // ${field.description || field.title || field.name
          }`
      )
      .join("\n")}
//   "createdAt": 1717488585078,
//   "updatedAt": 1717490751944
// }
\`\`\`

#### 读取多条数据 \`list\`

\`\`\`javascript
const { data } = await models.${modelName}.list({
  filter: {
    where: {
${queryExample}
    },
  },
  getCount: true, // 开启用来获取总数
});

// 返回查询到的数据列表 records 和 总数 total
console.log(data);
// {
//   "records": [
//     {
//       "_id": "记录ID1",
${userFields
      .slice(0, 3)
      .map(
        (field) =>
          `//       "${field.name}": ${generateFieldValue(field)}, // ${field.description || field.title || field.name
          }`
      )
      .join("\n")}
//       "createdAt": 1717488585078,
//       "updatedAt": 1717490751944
//     },
//     // ... 更多记录
//   ],
//   "total": 10
// }
\`\`\`

## 查询条件和排序

### 常用查询条件

\`\`\`javascript
// 等于查询
const { data } = await models.${modelName}.list({
  filter: {
    where: {
${queryField
      ? `      ${queryField.name}: {
        $eq: ${generateFieldValue(queryField)}, // ${queryField.description || queryField.title || queryField.name
      }等于指定值
      },`
      : '      _id: { $eq: "记录ID" },'
    }
    },
  },
});

${stringFields.length > 0
      ? `// 模糊查询
const { data: searchData } = await models.${modelName}.list({
  filter: {
    where: {
      ${stringFields[0].name}: {
        $regex: "关键词", // ${stringFields[0].description ||
      stringFields[0].title ||
      stringFields[0].name
      }包含关键词
      },
    },
  },
});`
      : ""
    }

${numberFields.length > 0
      ? `// 范围查询
const { data: rangeData } = await models.${modelName}.list({
  filter: {
    where: {
      ${numberFields[0].name}: {
        $gte: 10, // ${numberFields[0].description ||
      numberFields[0].title ||
      numberFields[0].name
      }大于等于10
        $lte: 100, // ${numberFields[0].description ||
      numberFields[0].title ||
      numberFields[0].name
      }小于等于100
      },
    },
  },
});`
      : ""
    }
\`\`\`

### 排序

\`\`\`javascript
const { data } = await models.${modelName}.list({
  filter: {
    where: {},
    orderBy: [
      {
        ${mainFields[0]
      ? `${mainFields[0].name}: "asc", // 按${mainFields[0].description ||
      mainFields[0].title ||
      mainFields[0].name
      }升序`
      : '_id: "desc", // 按ID降序'
    }
      },
    ],
  },
});
\`\`\`

${relations.length > 0
      ? `
## 关联查询

${relations
        .map(
          (rel) => `
### 查询关联的 ${rel.targetModel} 数据

\`\`\`javascript
const { data } = await models.${modelName}.list({
  filter: {
    where: {},
    include: {
      ${rel.field}: true, // 包含关联的${rel.targetModel}数据
    },
  },
});

// 返回的数据中会包含关联信息
console.log(data.records[0].${rel.field});
\`\`\`
`
        )
        .join("")}
`
      : ""
    }

## 更多操作

更多高级查询、分页、聚合等操作，请参考：
- [查询和筛选](https://docs.cloudbase.net/model/select)
- [过滤和排序](https://docs.cloudbase.net/model/filter-and-sort)
${relations.length > 0
      ? "- [关联关系](https://docs.cloudbase.net/model/relation)"
      : ""
    }
`;
}

export function registerDataModelTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // 数据模型查询工具
  server.registerTool?.(
    "manageDataModel",
    {
      title: "数据模型管理",
      description:
        "数据模型查询工具，支持查询和列表数据模型（只读操作）。通过 action 参数区分操作类型：list=获取模型列表（不含Schema，可选 names 参数过滤），get=查询单个模型详情（含Schema字段列表、格式、关联关系等，需要提供 name 参数），docs=生成SDK使用文档（需要提供 name 参数）",
      inputSchema: {
        action: z
          .enum(["get", "list", "docs"])
          .describe(
            "操作类型：get=查询单个模型（含Schema字段列表、格式、关联关系，需要提供 name 参数），list=获取模型列表（不含Schema，可选 names 参数过滤），docs=生成SDK使用文档（需要提供 name 参数）"
          ),
        name: z.string().optional().describe("要查询的数据模型名称。当 action='get' 或 action='docs' 时，此参数为必填项，必须提供已存在的数据模型名称。可通过 action='list' 操作获取可用的模型名称列表"),
        names: z
          .array(z.string())
          .optional()
          .describe("模型名称数组（list操作时可选，用于过滤）"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "database",
      },
    },
    async ({
      action,
      name,
      names,
    }: {
      action: "get" | "list" | "docs";
      name?: string;
      names?: string[];
    }) => {
      const cloudbase = await getManager();
      let currentEnvId = await getEnvId(cloudBaseOptions);

      let result;

      switch (action) {
          case "get":
            if (!name) {
              throw new Error("获取数据模型需要提供模型名称");
            }

            try {
              result = await cloudbase.commonService("lowcode").call({
                Action: "DescribeBasicDataSource",
                Param: {
                  EnvId: currentEnvId,
                  Name: name,
                },
              });
              logCloudBaseResult(server.logger, result);

              // 只保留基础字段，过滤掉冗余信息，并简化Schema
              let simplifiedSchema = null;

              // 解析并简化Schema
              if (result.Data.Schema) {
                try {
                  const schema = JSON.parse(result.Data.Schema);
                  const properties = schema.properties || {};

                  // 提取用户定义的字段（排除系统字段）
                  const userFields = Object.keys(properties)
                    .filter((key) => !properties[key]["x-system"]) // 排除系统字段
                    .map((key) => {
                      const field = properties[key];
                      return parseFieldStructure(field, key, schema);
                    });

                  // 提取关联关系
                  const relations = userFields
                    .filter((field) => field.linkage)
                    .map((field) => ({
                      field: field.name,
                      type: field.format,
                      title: field.title,
                      targetModel: field.linkage.parentDataSourceName,
                      foreignKey: field.linkage.parentFieldKey,
                      displayField: field.linkage.parentFieldTitle,
                    }));

                  simplifiedSchema = {
                    userFields,
                    relations,
                    totalFields: Object.keys(properties).length,
                    userFieldsCount: userFields.length,
                  };
                } catch (e) {
                  simplifiedSchema = { error: "Schema解析失败" };
                }
              }

              // 尝试生成Mermaid图表
              let mermaidDiagram = null;
              if (
                result.Data.Schema &&
                jsonSchemaToMermaid &&
                simplifiedSchema &&
                !simplifiedSchema.error
              ) {
                try {
                  const mainSchema = JSON.parse(result.Data.Schema);
                  const schemasMap: { [modelName: string]: any } = {
                    [name]: mainSchema,
                  };

                  // 获取关联模型的 schema
                  if (
                    simplifiedSchema.relations &&
                    simplifiedSchema.relations.length > 0
                  ) {
                    const relatedModelNames = [
                      ...new Set(
                        simplifiedSchema.relations.map(
                          (rel: any) => rel.targetModel
                        )
                      ),
                    ];

                    for (const relatedModelName of relatedModelNames) {
                      try {
                        const relatedResult = await cloudbase
                          .commonService("lowcode")
                          .call({
                            Action: "DescribeBasicDataSource",
                            Param: {
                              EnvId: currentEnvId,
                              Name: relatedModelName,
                            },
                          });

                        if (relatedResult.Data && relatedResult.Data.Schema) {
                          schemasMap[relatedModelName] = JSON.parse(
                            relatedResult.Data.Schema
                          );
                        }
                      } catch (e) {
                        console.warn(
                          `获取关联模型 ${relatedModelName} 的 schema 失败:`,
                          e
                        );
                      }
                    }
                  }

                  // 调用 jsonSchemaToMermaid，传入正确的参数格式
                  mermaidDiagram = jsonSchemaToMermaid(schemasMap);
                } catch (e) {
                  console.warn("生成Mermaid图表失败:", e);
                }
              }

              const simplifiedModel = {
                DbInstanceType: result.Data.DbInstanceType,
                Title: result.Data.Title,
                Description: result.Data.Description,
                Name: result.Data.Name,
                UpdatedAt: result.Data.UpdatedAt,
                Schema: simplifiedSchema,
                mermaid: mermaidDiagram,
              };

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: true,
                        action: "get",
                        data: simplifiedModel,
                        message: "获取数据模型成功",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            } catch (error: any) {
              if (error.original?.Code === "ResourceNotFound") {
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          success: false,
                          action: "get",
                          error: "ResourceNotFound",
                          message: `数据模型 ${name} 不存在`,
                        },
                        null,
                        2
                      ),
                    },
                  ],
                };
              }
              throw error;
            }

          case "list":
            // 构建请求参数
            const listParams: any = {
              EnvId: currentEnvId,
              PageIndex: 1,
              PageSize: 1000,
              QuerySystemModel: true, // 查询系统模型
              QueryConnector: 0, // 0 表示数据模型
            };

            // 只有当 names 参数存在且不为空时才添加过滤条件
            if (names && names.length > 0) {
              listParams.DataSourceNames = names;
            }

            result = await cloudbase.commonService("lowcode").call({
              Action: "DescribeDataSourceList",
              Param: listParams,
            });
            logCloudBaseResult(server.logger, result);

            const models = result.Data?.Rows || [];

            // 只保留基础字段，list操作不返回Schema
            const simplifiedModels = models.map((model: any) => ({
              DbInstanceType: model.DbInstanceType,
              Title: model.Title,
              Description: model.Description,
              Name: model.Name,
              UpdatedAt: model.UpdatedAt,
            }));

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      action: "list",
                      data: simplifiedModels,
                      count: simplifiedModels.length,
                      message: "获取数据模型列表成功",
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          case "docs":
            if (!name) {
              throw new Error("生成SDK文档需要提供模型名称");
            }

            try {
              // 先获取模型信息
              result = await cloudbase.commonService("lowcode").call({
                Action: "DescribeBasicDataSource",
                Param: {
                  EnvId: currentEnvId,
                  Name: name,
                },
              });
              logCloudBaseResult(server.logger, result);

              if (!result.Data) {
                throw new Error(`数据模型 ${name} 不存在`);
              }

              // 解析Schema获取字段信息
              let userFields: any[] = [];
              let relations: any[] = [];

              if (result.Data.Schema) {
                try {
                  const schema = JSON.parse(result.Data.Schema);
                  const properties = schema.properties || {};

                  // 提取用户定义的字段
                  userFields = Object.keys(properties)
                    .filter((key) => !properties[key]["x-system"])
                    .map((key) => {
                      const field = properties[key];
                      return parseFieldStructure(field, key, schema);
                    });

                  // 提取关联关系
                  relations = userFields
                    .filter((field) => field.linkage)
                    .map((field) => ({
                      field: field.name,
                      type: field.format,
                      title: field.title,
                      targetModel: field.linkage.parentDataSourceName,
                      foreignKey: field.linkage.parentFieldKey,
                      displayField: field.linkage.parentFieldTitle,
                    }));
                } catch (e) {
                  // Schema解析失败，使用空数组
                  console.error("Schema解析失败", e);
                }
              }

              // 生成SDK使用文档
              const docs = generateSDKDocs(
                result.Data.Name,
                result.Data.Title,
                userFields,
                relations
              );

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: true,
                        action: "docs",
                        modelName: name,
                        modelTitle: result.Data.Title,
                        docs,
                        message: "SDK使用文档生成成功",
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            } catch (error: any) {
              if (error.original?.Code === "ResourceNotFound") {
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          success: false,
                          action: "docs",
                          error: "ResourceNotFound",
                          message: `数据模型 ${name} 不存在`,
                        },
                        null,
                        2
                      ),
                    },
                  ],
                };
              }
              throw error;
            }

        default:
          throw new Error(`不支持的操作类型: ${action}`);
      }
    }
  );

  // modifyDataModel - 数据模型写工具（兼容名称，当前仅支持创建）
  server.registerTool?.(
    "modifyDataModel",
    {
      title: "修改数据模型（当前仅支持创建）",
      description:
        "基于Mermaid classDiagram创建数据模型。为保持兼容性，工具名仍为 modifyDataModel；当前仅支持创建新模型，不支持更新现有模型结构。内置异步任务监控，自动轮询直至完成或超时。",
      inputSchema: {
        mermaidDiagram: z.string()
          .describe(`Mermaid classDiagram代码，描述数据模型结构。
示例：
classDiagram
    class Student {
        name: string <<姓名>>
        age: number = 18 <<年龄>>
        gender: x-enum = "男" <<性别>>
        classId: string <<班级ID>>
        identityId: string <<身份ID>>
        course: Course[] <<课程>>
        required() ["name"]
        unique() ["name"]
        enum_gender() ["男", "女"]
        display_field() "name"
    }
    class Class {
        className: string <<班级名称>>
        display_field() "className"
    }
    class Course {
        name: string <<课程名称>>
        students: Student[] <<学生>>
        display_field() "name"
    }
    class Identity {
        number: string <<证件号码>>
        display_field() "number"
    }

    %% 关联关系
    Student "1" --> "1" Identity : studentId
    Student "n" --> "1" Class : student2class
    Student "n" --> "m" Course : course
    Student "n" <-- "m" Course : students
    %% 类的命名
    note for Student "学生模型"
    note for Class "班级模型"
    note for Course "课程模型"
    note for Identity "身份模型"
`),
        action: z
          .enum(["create"])
          .optional()
          .default("create")
          .describe("操作类型：create=创建新模型"),
        publish: z
          .boolean()
          .optional()
          .default(false)
          .describe("是否立即发布模型"),
        dbInstanceType: z
          .enum(["MYSQL", "FLEXDB"])
          .optional()
          .default("MYSQL")
          .describe("数据库实例类型：MYSQL=MySQL 数据库，FLEXDB=文档型数据库（NoSQL）"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "database",
      },
    },
    async ({
      mermaidDiagram,
      action = "create",
      publish = false,
      dbInstanceType = "MYSQL",
    }: {
      mermaidDiagram: string;
      action?: "create";
      publish?: boolean;
      dbInstanceType?: "MYSQL" | "FLEXDB";
    }) => {
      const cloudbase = await getManager();
      let currentEnvId = await getEnvId(cloudBaseOptions);

      const schemas = mermaidToJsonSchema(mermaidDiagram);

        if (!schemas || Object.keys(schemas).length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    error: "No schemas generated from Mermaid diagram",
                    message: "无法从Mermaid图表生成数据模型Schema",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // 创建数据模型列表
        const createDataModelList = Object.entries(schemas).map(
          ([name, schema]) => {
            return {
              CreateSource: "cloudbase_create",
              Creator: null,
              DbLinkName: null,
              Description:
                (schema as any).description ||
                `${(schema as any).title || name}数据模型`,
              Schema: JSON.stringify(createBackendSchemaParams(schema)),
              Title: (schema as any).title || name,
              Name: name,
              TableNameRule: "only_name",
            };
          }
        );

        // 调用批量创建数据模型API
        const result = await cloudbase.commonService("lowcode").call({
          Action: "BatchCreateDataModelList",
          Param: {
            CreateDataModelList: createDataModelList,
            Creator: null,
            DbInstanceType: dbInstanceType,
            EnvId: currentEnvId,
          },
        });
        logCloudBaseResult(server.logger, result);

        const taskId = result.Data?.TaskId;
        if (!taskId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    requestId: result.RequestId,
                    error: "No TaskId returned",
                    message: "创建任务失败，未返回任务ID",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // 轮询任务状态直至完成或超时
        const maxWaitTime = 30000; // 30秒超时
        const startTime = Date.now();
        let status = "init";
        let statusResult: any = null;

        while (status === "init" && Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待2秒

          statusResult = await cloudbase.commonService("lowcode").call({
            Action: "QueryModelTaskStatus",
            Param: {
              EnvId: currentEnvId,
              TaskId: taskId,
            },
          });
          logCloudBaseResult(server.logger, statusResult);

          status = statusResult.Data?.Status || "init";
        }

        // 返回最终结果
        const models = Object.keys(schemas);
        const successModels = statusResult?.Data?.SuccessResourceIdList || [];
        const failedModels = models.filter(
          (model) => !successModels.includes(model)
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: status === "success",
                  requestId: result.RequestId,
                  taskId: taskId,
                  models: models,
                  successModels: successModels,
                  failedModels: failedModels,
                  status: status,
                  action: action,
                  message:
                    status === "success"
                      ? `数据模型创建成功，共处理${models.length}个模型`
                      : status === "init"
                        ? `任务超时，任务ID: ${taskId}，请稍后手动查询状态`
                        : `数据模型创建失败`,
                  taskResult: statusResult?.Data,
                },
                null,
                2
              ),
            },
          ],
        };
    }
  );
}
