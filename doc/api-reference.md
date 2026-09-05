# CloudBase 开放 API 清单

> 本页面由定时任务每日自动从腾讯云官方文档同步生成（脚本：`scripts/generate-api-reference.mjs`），请勿手工编辑。
>
> - 数据源：[API 概览](https://cloud.tencent.com/document/api/876/34809) · [依赖产品接口指引](https://cloud.tencent.com/document/api/876/34808)
> - 所有接口均可通过 API 3.0 调用（如 CloudBase MCP 的 `callCloudApi` 工具、[API Explorer](https://console.cloud.tencent.com/api/explorer)）
> - 最近同步：2026-09-05

## API 概览

## 环境相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeEnvs](https://cloud.tencent.com/document/api/876/34820) | 获取环境列表 | 100 |
| [DestroyEnv](https://cloud.tencent.com/document/api/876/42149) | 销毁环境 | 20 |
| [CheckTcbService](https://cloud.tencent.com/document/api/876/42154) | 检查是否开通Tcb服务 | 20 |
| [CreateBillDeal](https://cloud.tencent.com/document/api/876/128117) | 创建计费订单 | 20 |
| [DescribeBillingInfo](https://cloud.tencent.com/document/api/876/94390) | 获取计费相关信息 | 50 |
| [DescribeEnvAccountCircle](https://cloud.tencent.com/document/api/876/128119) | 查询环境当前计费周期 | 20 |
| [DescribeBaasPackageList](https://cloud.tencent.com/document/api/876/78167) | 获取新套餐 | 20 |
| [DescribeStaticStore](https://cloud.tencent.com/document/api/876/128129) | 查看静态托管资源信息 | 20 |
| [CreateStaticStore](https://cloud.tencent.com/document/api/876/42152) | 创建静态托管资源 | 200 |
| [DescribeSafeRule](https://cloud.tencent.com/document/api/876/128118) | 查询数据库安全规则 | 20 |
| [DescribeAuthDomains](https://cloud.tencent.com/document/api/876/42151) | 获取安全域名列表 | 20 |
| [CreateAuthDomain](https://cloud.tencent.com/document/api/876/42764) | 增加安全域名 | 20 |
| [ModifyEnv](https://cloud.tencent.com/document/api/876/34818) | 更新环境信息 | 50 |
| [CreateHostingDomain](https://cloud.tencent.com/document/api/876/42153) | 创建托管域名 | 20 |
| [DestroyStaticStore](https://cloud.tencent.com/document/api/876/42148) | 销毁静态托管资源 | 20 |
| [DescribeEnvLimit](https://cloud.tencent.com/document/api/876/42146) | 查询环境个数上限接口 | 20 |
| [DescribeHostingDomainTask](https://cloud.tencent.com/document/api/876/57514) | 查询静态托管域名任务状态 | 20 |
| [DescribeQuotaData](https://cloud.tencent.com/document/api/876/42145) | 查询环境的配额使用量 | 2000 |
| [BindStorageSource](https://cloud.tencent.com/document/api/876/132025) | 云存储绑定外部存储源 | 20 |
| [ModifyStorageSource](https://cloud.tencent.com/document/api/876/132024) | 更新云存储外部数据源 | 20 |
| [UnbindStorageSource](https://cloud.tencent.com/document/api/876/132023) | 解绑云存储外部云存储源 | 20 |
| [CreateEnvResource](https://cloud.tencent.com/document/api/876/129358) | 创建环境相关资源 | 20 |
| [AllocateEnv](https://cloud.tencent.com/document/api/876/131594) | 从环境池分配环境 | 3000 |
| [ReleaseEnv](https://cloud.tencent.com/document/api/876/131592) | 释放从环境池里分配的环境 | 1000 |
| [AssumeRoleForAllocatedEnv](https://cloud.tencent.com/document/api/876/131593) | 为环境池里的环境申请角色临时凭证 | 1000 |

## 用户权限相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DeleteUsers](https://cloud.tencent.com/document/api/876/127960) | 删除tcb用户 | 20 |
| [CreateUser](https://cloud.tencent.com/document/api/876/127961) | 创建tcb用户 | 20 |
| [DescribeUserList](https://cloud.tencent.com/document/api/876/127959) | 查询tcb用户列表 | 20 |
| [ModifyUser](https://cloud.tencent.com/document/api/876/127958) | 更新tcb用户 | 20 |
| [DescribeResourcePermission](https://cloud.tencent.com/document/api/876/132256) | 查询资源基础权限 | 20 |
| [ModifyResourcePermission](https://cloud.tencent.com/document/api/876/132255) | 修改资源基础权限 | 20 |

## 云托管相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeCloudBaseRunServerVersion](https://cloud.tencent.com/document/api/876/49739) | 查询云托管服务版本的详情 | 1000 |
| [DescribeCloudBaseBuildService](https://cloud.tencent.com/document/api/876/48345) | 获取云托管代码上传和下载url | 20 |

## 计费相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateEnv](https://cloud.tencent.com/document/api/876/128592) | 创建环境 | 20 |
| [ModifyEnvPlan](https://cloud.tencent.com/document/api/876/128591) | 更新云开发环境套餐 | 20 |
| [RenewEnv](https://cloud.tencent.com/document/api/876/128590) | 续费云开发环境 | 20 |
| [DescribeCreditsUsage](https://cloud.tencent.com/document/api/876/132935) | 获取资源点用量 | 20 |
| [DescribeCreditsUsageDetail](https://cloud.tencent.com/document/api/876/132934) | 获取资源点用量明细 | 20 |
| [DescribeEnvPlans](https://cloud.tencent.com/document/api/876/133103) | 查询环境套餐信息 | 20 |

## 其他接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeGatewayVersions](https://cloud.tencent.com/document/api/876/129795) | 查询网关版本信息 | 20 |
| [ModifyClsTopic](https://cloud.tencent.com/document/api/876/81547) | 修改日志主题 | 20 |
| [DescribeCurveData](https://cloud.tencent.com/document/api/876/129258) | 查询环境监控曲线 | 100 |
| [DeleteAuthDomain](https://cloud.tencent.com/document/api/876/128960) | 删除合法域名 | 20 |
| [DescribeCloudBaseRunBuildLog](https://cloud.tencent.com/document/api/876/135707) | 查询构建日志 | 20 |

## 服务操作相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [ModifySafeRule](https://cloud.tencent.com/document/api/876/128959) | 设置数据库安全规则 | \- |

## 文档型云数据库相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [ModifyDatabaseACL](https://cloud.tencent.com/document/api/876/34819) | 修改文档型数据库权限 | 50 |
| [DescribeDatabaseACL](https://cloud.tencent.com/document/api/876/34821) | 获取文档型数据库权限 | 50 |
| [CreateTable](https://cloud.tencent.com/document/api/876/127968) | 创建文档型数据库表 | 20 |
| [DeleteTable](https://cloud.tencent.com/document/api/876/127967) | 删除文档型数据库表 | 20 |
| [DescribeTable](https://cloud.tencent.com/document/api/876/127966) | 查询文档型数据库表信息 | 20 |
| [DescribeTables](https://cloud.tencent.com/document/api/876/127962) | 查询文档型数据库所有表信息 | 20 |
| [ListTables](https://cloud.tencent.com/document/api/876/127965) | 查询文档型数据库所有表 | 20 |
| [UpdateTable](https://cloud.tencent.com/document/api/876/127964) | 修改文档型数据库表索引信息 | 20 |
| [RunCommands](https://cloud.tencent.com/document/api/876/129012) | 执行文档型数据库命令 | 1000 |

## 云项目相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeCloudAppCosInfo](https://cloud.tencent.com/document/api/876/135278) | 获取云应用cos信息 | 20 |
| [CreateCloudApp](https://cloud.tencent.com/document/api/876/135281) | 创建云应用 | 20 |
| [DeleteCloudApp](https://cloud.tencent.com/document/api/876/135280) | 删除云应用服务 | 20 |
| [DeleteCloudAppVersion](https://cloud.tencent.com/document/api/876/135279) | 删除云应用服务版本 | 20 |
| [DescribeCloudAppInfo](https://cloud.tencent.com/document/api/876/135277) | 查询云应用服务信息 | 20 |
| [DescribeCloudAppList](https://cloud.tencent.com/document/api/876/132936) | 查询云应用服务列表 | 20 |
| [DescribeCloudAppVersion](https://cloud.tencent.com/document/api/876/135276) | 查询云应用服务版本信息 | 20 |
| [DescribeCloudAppVersionList](https://cloud.tencent.com/document/api/876/135275) | 查询云应用服务版本列表 | 20 |

## 云开发接入相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateHTTPServiceRoute](https://cloud.tencent.com/document/api/876/129800) | 创建HTTP访问服务路由 | 20 |
| [VerifyHTTPServiceRoute](https://cloud.tencent.com/document/api/876/135630) | 校验HTTP访问服务路由 | 20 |
| [DeleteHTTPServiceRoute](https://cloud.tencent.com/document/api/876/129799) | 删除HTTP访问服务路由 | 20 |
| [DescribeHTTPServiceRoute](https://cloud.tencent.com/document/api/876/129798) | 查询HTTP访问服务路由信息 | 20 |
| [ModifyHTTPServiceRoute](https://cloud.tencent.com/document/api/876/129797) | 修改HTTP访问服务路由 | 20 |

## tcb相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [ModifyEnvExtra](https://cloud.tencent.com/document/api/876/137192) | 修改环境额外配置 | 20 |

## AI模型相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateAIModel](https://cloud.tencent.com/document/api/876/131320) | 创建AI模型 | 20 |
| [DeleteAIModel](https://cloud.tencent.com/document/api/876/131319) | 删除AI模型 | 20 |
| [DescribeAIModels](https://cloud.tencent.com/document/api/876/131318) | 查询AI模型列表 | 20 |
| [DescribeManagedAIModelList](https://cloud.tencent.com/document/api/876/131317) | 查询托管类型AI模型列表 | 20 |
| [UpdateAIModel](https://cloud.tencent.com/document/api/876/131316) | 更新AI模型 | 20 |

## 云服务器相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateVmInstance](https://cloud.tencent.com/document/api/876/129796) | 创建服务器实例 | 20 |
| [DeleteVmInstance](https://cloud.tencent.com/document/api/876/129761) | 销毁服务器实例 | 20 |
| [DescribeVmInstances](https://cloud.tencent.com/document/api/876/129760) | 查询环境下的服务器实例 | 20 |
| [DescribeVmSpec](https://cloud.tencent.com/document/api/876/129360) | 获取VM规格 | 20 |
| [InquireVmPrice](https://cloud.tencent.com/document/api/876/129759) | 查询云服务器价格 | 20 |

## 搜索日志相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [BindCls](https://cloud.tencent.com/document/api/876/136527) | 绑定用户自定义CLS日志主题 | 20 |
| [SearchClsLog](https://cloud.tencent.com/document/api/876/128127) | 搜索CLS日志 | 20 |

## SQL型云数据库相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateMySQL](https://cloud.tencent.com/document/api/876/128186) | 开通 MySql | 20 |
| [DescribePGUserMigration](https://cloud.tencent.com/document/api/876/132262) | 查看指定环境单条 migration 详情 | 20 |
| [ListPGUserMigrations](https://cloud.tencent.com/document/api/876/132261) | 查询目标环境已应用的 Migration | 20 |
| [PreviewPGUserMigrations](https://cloud.tencent.com/document/api/876/132260) | 预览SQL migrations 在远端的执行计划，不实际执行 SQL | 20 |
| [PushPGUserMigrations](https://cloud.tencent.com/document/api/876/132259) | 批量应用 Migrations | 20 |
| [RepairPGUserMigrationHistory](https://cloud.tencent.com/document/api/876/132258) | 修复Migration History | 20 |
| [DescribeCreateMySQLResult](https://cloud.tencent.com/document/api/876/128185) | 开通 MySql 结果查询 | 20 |
| [DescribeMySQLClusterDetail](https://cloud.tencent.com/document/api/876/128184) | 查询Mysql集群信息 | 20 |
| [DescribeMySQLTaskStatus](https://cloud.tencent.com/document/api/876/128183) | 销毁Mysql结果查询 | 20 |
| [DestroyMySQL](https://cloud.tencent.com/document/api/876/128182) | 销毁MySql | 20 |
| [RunSql](https://cloud.tencent.com/document/api/876/127880) | 执行MySQL语句 | 100 |
| [ExecutePGSql](https://cloud.tencent.com/document/api/876/130469) | 在PostgreSQL数据库上执行SQL查询 | 20 |
| [ModifyPGInstanceSpec](https://cloud.tencent.com/document/api/876/137349) | 修改 PG 独享实例规格 | 20 |

## 登录配置相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateCustomLoginKey](https://cloud.tencent.com/document/api/876/130046) | 自定义登录密钥生成 | 20 |
| [DescribeClient](https://cloud.tencent.com/document/api/876/129355) | 查询应用客户端详情 | 20 |
| [ModifyLoginConfig](https://cloud.tencent.com/document/api/876/129351) | 修改登录策略 | 20 |
| [DescribeLoginConfig](https://cloud.tencent.com/document/api/876/129354) | 获取登录策略 | 20 |
| [ModifyClient](https://cloud.tencent.com/document/api/876/129352) | 修改应用客户端 | 20 |
| [GetProviders](https://cloud.tencent.com/document/api/876/129353) | 获取三方认证源列表 | 20 |
| [ModifyProvider](https://cloud.tencent.com/document/api/876/129350) | 修改第三方认证源 | 20 |
| [DeleteProvider](https://cloud.tencent.com/document/api/876/129356) | 删除第三方认证源 | 20 |
| [AddProvider](https://cloud.tencent.com/document/api/876/129357) | 添加第三方认证源 | 20 |
| [CreateApiKey](https://cloud.tencent.com/document/api/876/129835) | 创建云开发平台的API Key | 20 |
| [DeleteApiKey](https://cloud.tencent.com/document/api/876/129834) | 删除云开发平台的API Key | 20 |
| [DescribeApiKeyList](https://cloud.tencent.com/document/api/876/129833) | 查询云开发平台的API Key列表 | 20 |

> 注意：
> 
> 以上给出的接口频率限制维度为`API + 接入地域 + 子账号`，有关限频更多说明参考：[API 频率限制说明](https://cloud.tencent.com/document/product/1278/109059)

## 依赖产品接口指引

## 概述

云开发（Tencent CloudBase，TCB）是腾讯云提供的云原生一体化开发环境和工具平台，为开发者提供高可用、自动弹性扩缩的后端云服务，包含计算、存储、托管等 Serverless 化能力，可用于云端一体化开发多种端应用（小程序、公众号、Web 应用等），帮助开发者统一构建和管理后端服务和云资源，避免了应用开发过程中繁琐的服务器搭建及运维，开发者可以专注于业务逻辑的实现，开发门槛更低，效率更高。

本章节介绍的云开发 API 接口均为 API 3.0/API 2.0 等接口。  
您可以调用 API 对云开发进行操作，例如获取用户权限，获取云开发项目列表等。  
云开发支持的所有接口信息，请参见 [API 概览](https://cloud.tencent.com/document/product/876/34809)。

## 云开发依赖资源接口指引

### MySQL 数据库

> **说明**：调用以下 MySQL 接口时，需要传入数据库集群 ID（`ClusterId`）。您可以调用 [DescribeMySQLClusterDetail](https://cloud.tencent.com/document/api/876/128184) 获取返回值中的 `DbClusterId` 字段作为 `ClusterId` 的值。

#### 账号管理

| 接口名称 | 接口功能 |
| --- | --- |
| [CreateAccounts](https://cloud.tencent.com/document/product/1003/71660) | 创建用户账号 |
| [DeleteAccounts](https://cloud.tencent.com/document/product/1003/92718) | 删除用户账号 |
| [DescribeAccountAllGrantPrivileges](https://cloud.tencent.com/document/product/1003/70114) | 查询账号所有可授予权限 |
| [DescribeAccountPrivileges](https://cloud.tencent.com/document/product/1003/92717) | 查询账号已有权限 |
| [DescribeAccounts](https://cloud.tencent.com/document/product/1003/48075) | 查询数据库账号列表 |
| [ModifyAccountDescription](https://cloud.tencent.com/document/product/1003/92716) | 修改数据库账号描述信息 |
| [ModifyAccountHost](https://cloud.tencent.com/document/product/1003/92715) | 修改账号主机 |
| [ModifyAccountParams](https://cloud.tencent.com/document/product/1003/70112) | 修改账号配置 |
| [ModifyAccountPrivileges](https://cloud.tencent.com/document/product/1003/92714) | 修改账号库表权限 |
| [ResetAccountPassword](https://cloud.tencent.com/document/product/1003/83592) | 修改数据库账号密码 |

#### 网络管理

| 接口名称 | 接口功能 |
| --- | --- |
| [CloseWan](https://cloud.tencent.com/document/product/1003/92737) | 关闭外网 |
| [OpenWan](https://cloud.tencent.com/document/product/1003/92732) | 开通外网 |

#### serverless集群管理

| 接口名称 | 接口功能 |
| --- | --- |
| [ResumeServerless](https://cloud.tencent.com/document/product/1003/70121) | 恢复serverless集群 |

#### 备份与回档

| 接口名称 | 接口功能 |
| --- | --- |
| [CreateBackup](https://cloud.tencent.com/document/product/1003/80212) | 创建手动备份 |
| [DeleteBackup](https://cloud.tencent.com/document/product/1003/82201) | 删除手动备份 |
| [ModifyBackupConfig](https://cloud.tencent.com/document/product/1003/48090) | 修改自动备份配置信息 |
| [DescribeBackupList](https://cloud.tencent.com/document/product/1003/48093) | 查询备份文件列表 |
| [DescribeBackupDownloadUrl](https://cloud.tencent.com/document/product/1003/76374) | 查询备份下载地址 |
| [RollBackCluster](https://cloud.tencent.com/document/product/1003/70115) | 集群回档 |

#### 任务与数据库管理

| 接口名称 | 接口功能 |
| --- | --- |
| [DescribeTasks](https://cloud.tencent.com/document/product/1003/103866) | 查询任务列表 |
| [DescribeClusterDatabaseTables](https://cloud.tencent.com/document/product/1003/113981) | 获取table列表 |
| [DescribeClusterDatabases](https://cloud.tencent.com/document/product/1003/101559) | 获取集群数据库列表 |

### SCF 云函数

> 此外，调用云函数接口时还需传入以下两个参数：
> 
> *   **Stamp**：固定值 `"MINI_QCBASE"`
>     
> *   **Role**：云函数执行角色名称。
>     
>     ⚠️ **安全提示**：若您是**普通用户（单环境账户）**，可直接传入默认角色 `TCB_QcsRole`，无需额外配置。
>     
>     若您是**平台客户**，通过环境划分管理多个小租户时，使用 `TCB_QcsRole` 存在**跨环境越权风险**，建议为每个环境创建独立的自定义 CAM 角色：
>     
>     1.  前往 [CAM 角色控制台](https://console.cloud.tencent.com/cam/role) 创建角色；
>     2.  角色载体选择**腾讯云产品服务**；
>     3.  服务授权对象勾选 **SCF（云函数）** 和 **CLS（日志服务）**；
>     4.  关联策略 **`QcloudCLSFullAccess`**；
>     5.  记录角色名称（例如 `SCF_CLSFullAccess`），并将其作为 `Role` 参数的值传入。

| 接口名称 | 接口功能 |
| --- | --- |
| [CreateFunction](https://cloud.tencent.com/document/product/583/18586) | 创建函数 |
| [UpdateFunctionCode](https://cloud.tencent.com/document/product/583/18581) | 更新函数代码 |
| [ListFunctions](https://cloud.tencent.com/document/product/583/18582) | 获取函数列表 |
| [Invoke](https://cloud.tencent.com/document/product/583/17243) | 运行函数 |
| [GetFunction](https://cloud.tencent.com/document/product/583/18584) | 获取函数详细信息 |
| [GetFunctionAddress](https://cloud.tencent.com/document/product/583/37164) | 获取函数代码下载地址 |
| [CreateTrigger](https://cloud.tencent.com/document/product/583/18589) | 设置函数触发方式 |
| [DeleteTrigger](https://cloud.tencent.com/document/product/583/18588) | 删除触发器 |
| [CopyFunction](https://cloud.tencent.com/document/product/583/33847) | 复制函数 |
| [UpdateFunctionConfiguration](https://cloud.tencent.com/document/product/583/18580) | 更新函数配置 |
| [DeleteFunction](https://cloud.tencent.com/document/product/583/18585) | 删除函数 |

### COS 对象操作

> **说明**：调用文件操作接口时，需根据上传目标获取对应的存储信息：
> 
> *   **上传到静态托管**：调用 [DescribeEnvs](https://cloud.tencent.com/document/product/876/34820) 获取返回值中的 `StaticStorages` 字段（[StaticStorageInfo 结构](https://cloud.tencent.com/document/api/876/34822#StaticStorageInfo)），从中获取静态资源相关信息。
> *   **上传到云存储**：调用 [DescribeEnvs](https://cloud.tencent.com/document/product/876/34820) 获取返回值中的 `StorageInfo` 字段（[StorageInfo 结构](https://cloud.tencent.com/document/api/876/34822#StorageInfo)），从中获取云存储相关信息。

| Node SDK接口名称 | 接口功能 |
| --- | --- |
| [uploadFile](https://cloud.tencent.com/document/product/436/64980) | 上传对象 |
| [GetObject](https://cloud.tencent.com/document/api/436/7753) | 下载对象 |
| [DeleteObject](https://cloud.tencent.com/document/api/436/7743) | 删除对象 |
| [DeleteMultipleObjects](https://cloud.tencent.com/document/api/436/8289) | 批量删除对象 |
| [PutObjectCopy](https://cloud.tencent.com/document/api/436/10881) | 移动/复制对象 |
| [Select](https://cloud.tencent.com/document/api/436/37641) | 检索对象内容 |

## API 快速入门

您可以使用 API Explorer 工具在线调用 API。  
本文以 **获取环境列表** 为例，通过 API Explorer 工具调用 API 接口的步骤如下：

1.  进入 [API Explorer](https://console.cloud.tencent.com/api/explorer) 工具页面。更多 API Explorer 工具使用信息，请参见 [使用 API Explorer](https://cloud.tencent.com/document/product/1278/46697)。
2.  调用 [DescribeEnvs](https://cloud.tencent.com/document/product/876/34820)，从而获取云开发环境相关信息。

