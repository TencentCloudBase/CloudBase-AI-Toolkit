# CloudBase Console Entry Points

After creating or deploying resources, provide the corresponding console management link. All console URLs follow the pattern: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/{path}`.

The CloudBase console changes frequently. If a logged-in console shows a different hash path from this list, prefer the live console path and update this file instead of copying stale URLs forward.

## Common entry points

- **Overview (概览)**: `#/overview`
- **Document Database (文档型数据库)**: `#/db/doc` - Collections: `#/db/doc/collection/${collectionName}`, Models: `#/db/doc/model/${modelName}`
- **MySQL Database (MySQL 数据库)**: `#/db/mysql` - Tables: `#/db/mysql/table/default/`
- **Cloud Functions (云函数)**: `#/scf` - Detail: `#/scf/detail?id=${functionName}&NameSpace=${envId}`
- **CloudRun (云托管)**: `#/platform-run`
- **Cloud Storage (云存储)**: `#/storage`
- **Identity Authentication (身份认证)**: `#/identity` - Login: `#/identity/login-manage`, Tokens: `#/identity/token-management`

## Other useful entry points

- **Template Center**: `#/cloud-template/market`
- **AI+**: `#/ai`
- **Static Website Hosting**: `#/static-hosting`
- **Weida Low-Code**: `#/lowcode/apps`
- **Logs & Monitoring**: `#/devops/log`
- **Extensions**: `#/apis`
- **Environment Settings**: `#/env/http-access`
