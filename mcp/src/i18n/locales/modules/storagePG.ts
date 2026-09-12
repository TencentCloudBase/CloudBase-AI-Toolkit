import { defineModule } from "../types.js";

export const storagePG = defineModule(
  {
    title: "查询 PostgreSQL 环境云存储能力和上传方案",
    description:
      "查询 CloudBase PostgreSQL 环境下的云存储能力。返回 bucket/config 能力摘要、对象信息查询方案，以及基于 HTTP API 或 SDK 的上传实现方案；不会读取本地文件，也不会默认输出大量签名 URL。",
    cloudModeUnavailable:
      "queryPgStorage action={action} 在 hosted/云端模式下不可用：该操作依赖真实 bucket 名称和存储数据面访问。请在应用代码中直接使用 CloudBase SDK 或 HTTP API 完成存储操作，或改用本地模式运行 MCP 后重试。hosted 模式下本工具仅支持 buckets/config 能力摘要查询。",
    cloudModeRecommendation:
      "PG 存储数据面操作请在应用代码中使用 CloudBase SDK 或 HTTP API。",
    bucketRequired: "查询 PostgreSQL 存储时必须提供 bucket。",
    bucketsNote:
      "MCP 中 PG 环境存储以元数据与实现方案的形式暴露。应用侧数据面上传/下载请使用 SDK 或 HTTP API 代码。",
    bucketsSuccess:
      "已获取 PostgreSQL 存储能力摘要。应用侧上传实现请使用 uploadPlan。",
    createBucketRequired: "创建 PG 存储 bucket 时必须提供 bucket 名称。",
    createBucketDescription: "创建 PG 存储 bucket '{bucket}'",
    createBucketTokenGuide:
      "使用 manageAppAuth(action='createApiKey', name='storage-server-key') 获取 service_role 级别的 API key token。",
    createBucketNextStepA: "方案 A：通过 managePgDatabase(action='execute', confirm=true) 执行 SQL",
    createBucketNextStepB: "方案 B：使用 service_role token 调用 HTTP API",
    createBucketNextStepC: "方案 C：使用 CloudBase CLI：tcb db execute",
    createBucketSuccess:
      "已生成 bucket '{bucket}' 的创建方案。执行任一提供的方案完成创建，然后配置 RLS 策略。",
    uploadPlanStep1: "获取应用侧或服务侧 access token。",
    uploadPlanStep2: "在应用代码中调用 CloudBase 存储 HTTP API 或 Manager SDK。",
    uploadPlanStep3: "在 MCP 之外上传文件字节内容；如需校验元信息，再调用 objectInfo。",
    uploadPlanSuccess:
      "已生成不包含签名 URL 与文件内容的 HTTP API 上传方案，保持多文件上传场景下 MCP token 用量稳定。",
    objectInfoSuccess:
      "已生成对象元信息查询方案。实际存储数据面调用请使用应用代码或服务端代码。",
    signedUrlRecommendation:
      "多文件流程请使用 queryPgStorage(action=uploadPlan) 及 HTTP API/SDK 应用代码。",
    signedUrlNotDefault:
      "签名 URL 生成被有意设为非默认 PG 存储路径，因为多文件签名输出会浪费 token。除非明确需要委托式一次性上传/下载，请使用 uploadPlan。",
    unsupportedAction: "不支持的 PostgreSQL 存储操作：{action}",
  },
  {
    title: "Query PostgreSQL environment storage capabilities and upload plans",
    description:
      "Query cloud storage capabilities of a CloudBase PostgreSQL environment. Returns a bucket/config capability summary, object metadata query plans, and upload implementation plans based on the HTTP API or SDK; it never reads local files and does not emit bulk signed URLs by default.",
    cloudModeUnavailable:
      "queryPgStorage action={action} is unavailable in hosted/cloud mode: it depends on real bucket names and storage data-plane access. Use the CloudBase SDK or HTTP API directly in application code for storage operations, or run MCP in local mode and retry. In hosted mode this tool only supports the buckets/config capability summary queries.",
    cloudModeRecommendation:
      "Use the CloudBase SDK or HTTP API in application code for PG storage data-plane operations.",
    bucketRequired: "Provide bucket when querying PostgreSQL storage.",
    bucketsNote:
      "PG environment storage is exposed as metadata and implementation plans in MCP. Application data-plane upload/download should use SDK or HTTP API code.",
    bucketsSuccess:
      "Resolved PostgreSQL storage capability summary. Use uploadPlan for application-side upload implementation.",
    createBucketRequired: "Provide bucket name to create a PG storage bucket.",
    createBucketDescription: "Creates PG storage bucket '{bucket}'",
    createBucketTokenGuide:
      "Use manageAppAuth(action='createApiKey', name='storage-server-key') to get a service_role level API key token.",
    createBucketNextStepA: "Option A: Run the SQL via managePgDatabase(action='execute', confirm=true)",
    createBucketNextStepB: "Option B: Call the HTTP API with a service_role token",
    createBucketNextStepC: "Option C: Use CloudBase CLI: tcb db execute",
    createBucketSuccess:
      "Generated bucket creation plan for '{bucket}'. Execute one of the provided plans to create the bucket, then configure RLS policies.",
    uploadPlanStep1: "Get an application-side or service-side access token.",
    uploadPlanStep2: "Call the CloudBase storage HTTP API or Manager SDK from application code.",
    uploadPlanStep3: "Upload file bytes outside MCP, then call objectInfo if metadata verification is needed.",
    uploadPlanSuccess:
      "Generated an HTTP API upload plan without signed URLs or file content. This keeps MCP token usage stable for multi-file uploads.",
    objectInfoSuccess:
      "Generated an object metadata query plan. Use application code or service code for actual storage data-plane calls.",
    signedUrlRecommendation:
      "Use queryPgStorage(action=uploadPlan) and HTTP API/SDK application code for multi-file flows.",
    signedUrlNotDefault:
      "Signed URL generation is intentionally not the default PG storage path because multi-file signed outputs waste tokens. Use uploadPlan unless a delegated one-off upload/download is explicitly required.",
    unsupportedAction: "Unsupported PostgreSQL storage action: {action}",
  },
);
