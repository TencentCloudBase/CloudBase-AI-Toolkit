import { defineModule } from "../types.js";

export const storage = defineModule(
  {
    queryTitle: "查询 CloudBase 存储信息",
    queryDescription:
      "⚠️ PG 模式环境请使用 queryPgStorage 而非本工具（pgstore 与旧 COS 是两套独立系统）。\n\n查询 CloudBase 云存储信息，支持列出目录文件、获取文件信息、获取临时下载链接等只读操作。返回的文件信息包括文件名、大小、修改时间、下载链接等。注意：action=url 返回的 temporaryUrl 是临时签名链接，有效期由 maxAge 参数决定（默认1小时），不要当作永久公网地址使用。工具还会基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导 publicUrl，⚠️ 警告：publicUrl 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先通过控制台/SDK 将目标路径设置为公有读。\n\n💡 存储桶 ACL 权限管理请使用 permissions 工具：queryPermissions(action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\") 查询，managePermissions(action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"READONLY\") 设置。\n\n📦 CloudBase PG / pgstore 环境：`DescribeEnvs.Storages[]` 列出的 bucket 是旧 NoSQL 后端的，不等于 pgstore bucket。本工具用于查看常规存储；为 PG 浏览器上传准备 bucket 时，请确认目标 bucket 是 pgstore 后端可用的，否则浏览器 `app.storage.from().upload(...)` 会得到 `STORAGE_BUCKET_NOT_FOUND` 并出现 `PUT https://undefined/`。",
    manageTitle: "管理 CloudBase 存储文件",
    manageDescription:
      "⚠️ PG 模式环境请使用 queryPgStorage 而非本工具（pgstore 与旧 COS 是两套独立系统）。\n\n管理 CloudBase 云存储文件，仅用于 COS/Storage 对象，不用于静态网站托管。支持上传文件/目录、下载文件/目录、删除文件/目录等操作。删除操作需要设置force=true进行确认，防止误删除重要文件。注意：上传后返回的 temporaryUrl 是临时签名链接，1小时后过期，不要当作永久公网地址写入配置或持久化存储。工具还会基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导 publicUrl，⚠️ 警告：publicUrl 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先通过控制台/SDK 将目标路径设置为公有读。\n\n💡 存储桶 ACL 权限管理请使用 permissions 工具：queryPermissions(action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\") 查询，managePermissions(action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"READONLY\") 设置。\n\n📦 CloudBase PG / pgstore 桶必须先创建后使用（与 Supabase Storage 一致：upload 前 bucket 必须存在）。浏览器 SDK `app.storage.from().upload(path, file)` 不会自动建桶，且 `path` 的第一段就是 bucket 名（例如 `covers/foo.png` → bucket=`covers`）；`from('covers')` 这个参数当前不会被拼到 path 里。如果上传时浏览器看到 `STORAGE_BUCKET_NOT_FOUND` 或 `PUT https://undefined/`（DevTools 表现为 `net::ERR_NAME_NOT_RESOLVED`），先用本工具或控制台确认 / 创建对应的 pgstore bucket，再让前端重试上传，不要让前端把上传失败静默吞掉。`DescribeEnvs.Storages[]` 返回的旧 NoSQL bucket（形如 `<hash>-<envId>-<appId>`）不是可用的 pgstore bucket，切勿当作默认目标使用。",
    managerInitFailed: "初始化 CloudBase Manager 失败。请检查凭证与环境配置。",
    readBinaryUnsupported:
      "queryStorage action=read 仅支持读取文本文件内容；二进制文件请改用 action=url 获取下载链接，或使用 manageStorage(action=\"download\") 下载到本地。",
    listSuccess: "成功列出目录 '{path}' 下的 {count} 个文件",
    infoSuccess: "成功获取文件 '{path}' 的详细信息",
    seconds: "秒",
    urlNote:
      "temporaryUrl 是临时签名链接，会按 expireTime 过期。publicUrl 基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导，⚠️ 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先将目标路径设置为公有读。",
    urlSuccess: "成功为 '{path}' 生成临时下载链接",
    readSuccess: "成功读取 '{path}' 的文本内容",
    readSuccessTruncated: "成功读取 '{path}' 的文本内容（截断至 {bytes} 字节）",
    unsupportedAction: "不支持的操作: {action}",
    queryFailed: "queryStorage 操作失败: {message}",
    oneHour: "1小时",
    uploadNote:
      "temporaryUrl 是临时签名链接，1小时后过期，不要当作永久公网地址写入配置或持久化存储。publicUrl 基于 DescribeEnvs 返回的 Storages[0].CdnDomain 推导，⚠️ 仅在存储桶 ACL 为公有读（所有用户可读）时才能被匿名访问；默认私有读写存储桶返回的 publicUrl 会 403，此时请继续使用 temporaryUrl 或先将目标路径设置为公有读。",
    itemDirectory: "目录",
    itemFile: "文件",
    uploadSuccess: "成功将{type}从 '{localPath}' 上传到 '{cloudPath}'",
    downloadSuccess: "成功将{type}从 '{cloudPath}' 下载到 '{localPath}'",
    deleteRequiresConfirmation: "删除操作需要确认",
    deleteForceHint: "请设置 force: true 以确认删除。该操作不可撤销。",
    deleteSuccess: "成功删除{type} '{cloudPath}'",
    manageFailed: "manageStorage 操作失败: {message}",
  },
  {
    queryTitle: "Query CloudBase storage info",
    queryDescription:
      "⚠️ For PG-mode environments use queryPgStorage instead of this tool (pgstore and the legacy COS are two separate systems).\n\nQuery CloudBase cloud storage info: list directory files, get file details, get temporary download URLs, and other read-only operations. Returned file info includes name, size, modification time, download URL, etc. Note: the temporaryUrl returned by action=url is a temporary signed link whose validity is determined by the maxAge parameter (default 1 hour); do not treat it as a permanent public URL. The tool also derives publicUrl from the Storages[0].CdnDomain returned by DescribeEnvs. ⚠️ Warning: publicUrl is anonymously accessible only when the bucket ACL is public-read; with the default private-read-write bucket the returned publicUrl will 403 — keep using temporaryUrl, or first set the target path to public-read via the console/SDK.\n\n💡 For bucket ACL permission management use the permissions tool: query with queryPermissions(action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\"), set with managePermissions(action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"READONLY\").\n\n📦 CloudBase PG / pgstore environments: buckets listed in `DescribeEnvs.Storages[]` belong to the legacy NoSQL backend and are not pgstore buckets. Use this tool for regular storage; when preparing a bucket for PG browser uploads, confirm the target bucket is usable by the pgstore backend, otherwise the browser `app.storage.from().upload(...)` will fail with `STORAGE_BUCKET_NOT_FOUND` and a `PUT https://undefined/` request.",
    manageTitle: "Manage CloudBase storage files",
    manageDescription:
      "⚠️ For PG-mode environments use queryPgStorage instead of this tool (pgstore and the legacy COS are two separate systems).\n\nManage CloudBase cloud storage files — for COS/Storage objects only, not for static website hosting. Supports uploading/downloading/deleting files and directories. Delete operations require force=true as confirmation to prevent accidental deletion. Note: the temporaryUrl returned after upload is a temporary signed link that expires in 1 hour; do not write it into configuration or persistent storage as a permanent public URL. The tool also derives publicUrl from the Storages[0].CdnDomain returned by DescribeEnvs. ⚠️ Warning: publicUrl is anonymously accessible only when the bucket ACL is public-read; with the default private-read-write bucket the returned publicUrl will 403 — keep using temporaryUrl, or first set the target path to public-read via the console/SDK.\n\n💡 For bucket ACL permission management use the permissions tool: query with queryPermissions(action=\"getResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\"), set with managePermissions(action=\"updateResourcePermission\", resourceType=\"storage\", resourceId=\"bucket-name\", permission=\"READONLY\").\n\n📦 CloudBase PG / pgstore buckets must be created before use (same as Supabase Storage: the bucket must exist before upload). The browser SDK `app.storage.from().upload(path, file)` does not create buckets automatically, and the first segment of `path` is the bucket name (e.g. `covers/foo.png` → bucket=`covers`); the argument of `from('covers')` is currently not prepended to the path. If the browser sees `STORAGE_BUCKET_NOT_FOUND` or `PUT https://undefined/` during upload (shown as `net::ERR_NAME_NOT_RESOLVED` in DevTools), first confirm / create the corresponding pgstore bucket with this tool or the console, then have the frontend retry the upload — do not let the frontend silently swallow the upload failure. Legacy NoSQL buckets returned by `DescribeEnvs.Storages[]` (shaped like `<hash>-<envId>-<appId>`) are not usable pgstore buckets; never use them as the default target.",
    managerInitFailed: "Failed to initialize CloudBase manager. Please check your credentials and environment configuration.",
    readBinaryUnsupported:
      "queryStorage action=read supports text files only; for binary files use action=url to get a download URL, or use manageStorage(action=\"download\") to download to local disk.",
    listSuccess: "Successfully listed {count} files in directory '{path}'",
    infoSuccess: "Successfully retrieved file info for '{path}'",
    seconds: "s",
    urlNote:
      "temporaryUrl is a temporary signed link that expires at expireTime. publicUrl is derived from the Storages[0].CdnDomain returned by DescribeEnvs. ⚠️ It is anonymously accessible only when the bucket ACL is public-read; with the default private-read-write bucket the returned publicUrl will 403 — keep using temporaryUrl, or first set the target path to public-read.",
    urlSuccess: "Successfully generated temporary URL for '{path}'",
    readSuccess: "Successfully read text content for '{path}'",
    readSuccessTruncated: "Successfully read text content for '{path}' (truncated to {bytes} bytes)",
    unsupportedAction: "Unsupported action: {action}",
    queryFailed: "queryStorage operation failed: {message}",
    oneHour: "1 hour",
    uploadNote:
      "temporaryUrl is a temporary signed link that expires in 1 hour; do not write it into configuration or persistent storage as a permanent public URL. publicUrl is derived from the Storages[0].CdnDomain returned by DescribeEnvs. ⚠️ It is anonymously accessible only when the bucket ACL is public-read; with the default private-read-write bucket the returned publicUrl will 403 — keep using temporaryUrl, or first set the target path to public-read.",
    itemDirectory: "directory",
    itemFile: "file",
    uploadSuccess: "Successfully uploaded {type} from '{localPath}' to '{cloudPath}'",
    downloadSuccess: "Successfully downloaded {type} from '{cloudPath}' to '{localPath}'",
    deleteRequiresConfirmation: "Delete operation requires confirmation",
    deleteForceHint: "Please set force: true to confirm deletion. This action cannot be undone.",
    deleteSuccess: "Successfully deleted {type} '{cloudPath}'",
    manageFailed: "manageStorage operation failed: {message}",
  },
);
