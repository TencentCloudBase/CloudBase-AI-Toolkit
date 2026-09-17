import { defineModule } from "../types.js";

export const dataModel = defineModule(
  {
    "manageDataModel.title": "数据模型管理",
    "manageDataModel.description":
      "数据模型查询工具，支持查询和列表数据模型（只读操作）。通过 action 参数区分操作类型：list=获取模型列表（不含Schema，可选 names 参数过滤），get=查询单个模型详情（含Schema字段列表、格式、关联关系等，需要提供 name 参数），docs=生成SDK使用文档（需要提供 name 参数）",
    "schema.manage.action":
      "操作类型：get=查询单个模型（含Schema字段列表、格式、关联关系，需要提供 name 参数），list=获取模型列表（不含Schema，可选 names 参数过滤），docs=生成SDK使用文档（需要提供 name 参数）",
    "schema.manage.name": "要查询的数据模型名称。当 action='get' 或 action='docs' 时，此参数为必填项，必须提供已存在的数据模型名称。可通过 action='list' 操作获取可用的模型名称列表",
    "schema.manage.names": "模型名称数组（list操作时可选，用于过滤）",
    "manageDataModel.nameRequired": "获取数据模型需要提供模型名称",
    "manageDataModel.schemaParseFailed": "Schema解析失败",
    "manageDataModel.relatedSchemaWarn": "获取关联模型 {name} 的 schema 失败:",
    "manageDataModel.mermaidWarn": "生成Mermaid图表失败:",
    "manageDataModel.getSuccess": "获取数据模型成功",
    "manageDataModel.modelNotFound": "数据模型 {name} 不存在",
    "manageDataModel.listSuccess": "获取数据模型列表成功",
    "manageDataModel.docsNameRequired": "生成SDK文档需要提供模型名称",
    "manageDataModel.docsSuccess": "SDK使用文档生成成功",
    "modifyDataModel.title": "修改数据模型（当前仅支持创建）",
    "modifyDataModel.description":
      "基于Mermaid classDiagram创建数据模型。为保持兼容性，工具名仍为 modifyDataModel；当前仅支持创建新模型，不支持更新现有模型结构。内置异步任务监控，自动轮询直至完成或超时。",
    "schema.modify.mermaidDiagram": `Mermaid classDiagram代码，描述数据模型结构。
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
`,
    "schema.modify.action": "操作类型：create=创建新模型",
    "schema.modify.publish": "是否立即发布模型",
    "schema.modify.dbInstanceType": "数据库实例类型，可选值：MYSQL=MySQL 数据库，FLEXDB=文档型数据库（NoSQL）",
    "modifyDataModel.noSchemas": "无法从Mermaid图表生成数据模型Schema",
    "modifyDataModel.defaultModelDescription": "{name}数据模型",
    "modifyDataModel.noTaskId": "创建任务失败，未返回任务ID",
    "modifyDataModel.createSuccess": "数据模型创建成功，共处理{count}个模型",
    "modifyDataModel.taskTimeout":
      "任务超时（最后状态: {status}），任务ID: {taskId}，请稍后手动查询状态",
    "modifyDataModel.createFailed": "数据模型创建失败（status={status}）",
    "fieldParse.depthExceeded": "递归深度超限",
    "fieldParse.arrayItemTitle": "数组元素",
    "fieldParse.arrayItemParseFailed": "数组元素结构解析失败",
    "fieldParse.objectPropertyTitle": "对象属性",
    "fieldParse.objectPropertyParseFailed": "对象属性结构解析失败",
    "unsupportedAction": "不支持的操作类型: {action}",
  },
  {
    "manageDataModel.title": "Data model management",
    "manageDataModel.description":
      "Data model query tool that supports querying and listing data models (read-only). Distinguish operations via the action parameter: list=get the model list (without Schema, optional names parameter for filtering), get=query a single model's details (including Schema field list, formats, relations, etc.; requires the name parameter), docs=generate SDK usage documentation (requires the name parameter)",
    "schema.manage.action":
      "Operation type: get=query a single model (including its Schema field list, formats, and relations; requires the name parameter), list=get the model list (without Schema; optional names parameter for filtering), docs=generate SDK usage documentation (requires the name parameter)",
    "schema.manage.name": "Name of the data model to query. This parameter is required when action='get' or action='docs' and must identify an existing data model. Use action='list' to obtain available model names",
    "schema.manage.names": "Array of model names, optionally used to filter the list operation",
    "manageDataModel.nameRequired":
      "A model name is required to fetch a data model",
    "manageDataModel.schemaParseFailed": "Failed to parse Schema",
    "manageDataModel.relatedSchemaWarn":
      "Failed to get the schema of related model {name}:",
    "manageDataModel.mermaidWarn": "Failed to generate Mermaid diagram:",
    "manageDataModel.getSuccess": "Data model fetched successfully",
    "manageDataModel.modelNotFound": "Data model {name} does not exist",
    "manageDataModel.listSuccess": "Data model list fetched successfully",
    "manageDataModel.docsNameRequired":
      "A model name is required to generate SDK docs",
    "manageDataModel.docsSuccess":
      "SDK usage documentation generated successfully",
    "modifyDataModel.title": "Modify data model (create only)",
    "modifyDataModel.description":
      "Create data models from a Mermaid classDiagram. For compatibility, the tool name remains modifyDataModel; currently only creating new models is supported, not updating existing model structures. Includes async task monitoring that polls automatically until completion or timeout.",
    "schema.modify.mermaidDiagram": `Mermaid classDiagram code describing the data model structure.
Example:
classDiagram
    class Student {
        name: string <<Name>>
        age: number = 18 <<Age>>
        gender: x-enum = "Male" <<Gender>>
        classId: string <<Class ID>>
        identityId: string <<Identity ID>>
        course: Course[] <<Courses>>
        required() ["name"]
        unique() ["name"]
        enum_gender() ["Male", "Female"]
        display_field() "name"
    }
    class Class {
        className: string <<Class name>>
        display_field() "className"
    }
    class Course {
        name: string <<Course name>>
        students: Student[] <<Students>>
        display_field() "name"
    }
    class Identity {
        number: string <<Document number>>
        display_field() "number"
    }

    %% Relationships
    Student "1" --> "1" Identity : studentId
    Student "n" --> "1" Class : student2class
    Student "n" --> "m" Course : course
    Student "n" <-- "m" Course : students
    %% Class names
    note for Student "Student model"
    note for Class "Class model"
    note for Course "Course model"
    note for Identity "Identity model"
`,
    "schema.modify.action": "Operation type: create=create a new model",
    "schema.modify.publish": "Whether to publish the model immediately",
    "schema.modify.dbInstanceType": "Database instance type: MYSQL=MySQL database, FLEXDB=document database (NoSQL)",
    "modifyDataModel.noSchemas":
      "Cannot generate data model Schema from the Mermaid diagram",
    "modifyDataModel.defaultModelDescription": "{name} data model",
    "modifyDataModel.noTaskId": "Creation task failed: no task ID returned",
    "modifyDataModel.createSuccess":
      "Data models created successfully, {count} models processed in total",
    "modifyDataModel.taskTimeout":
      "Task timed out (last status: {status}), task ID: {taskId}; please query the status manually later",
    "modifyDataModel.createFailed":
      "Data model creation failed (status={status})",
    "fieldParse.depthExceeded": "Recursion depth exceeded",
    "fieldParse.arrayItemTitle": "Array item",
    "fieldParse.arrayItemParseFailed": "Failed to parse array item structure",
    "fieldParse.objectPropertyTitle": "Object property",
    "fieldParse.objectPropertyParseFailed":
      "Failed to parse object property structure",
    "unsupportedAction": "Unsupported action type: {action}",
  },
);
