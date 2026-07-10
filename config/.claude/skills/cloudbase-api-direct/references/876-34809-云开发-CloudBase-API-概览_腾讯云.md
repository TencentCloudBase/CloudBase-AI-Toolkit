[API 中心](/document/api)

## API 概览

最近更新时间：2026-07-07 02:41:34

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 本页目录：

-   [环境相关接口](#.E7.8E.AF.E5.A2.83.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "环境相关接口")
-   [用户权限相关接口](#.E7.94.A8.E6.88.B7.E6.9D.83.E9.99.90.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "用户权限相关接口")
-   [云托管相关接口](#.E4.BA.91.E6.89.98.E7.AE.A1.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "云托管相关接口")
-   [计费相关接口](#.E8.AE.A1.E8.B4.B9.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "计费相关接口")
-   [其他接口](#.E5.85.B6.E4.BB.96.E6.8E.A5.E5.8F.A3 "其他接口")
-   [服务操作相关接口](#.E6.9C.8D.E5.8A.A1.E6.93.8D.E4.BD.9C.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "服务操作相关接口")
-   [文档型云数据库相关接口](#.E6.96.87.E6.A1.A3.E5.9E.8B.E4.BA.91.E6.95.B0.E6.8D.AE.E5.BA.93.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "文档型云数据库相关接口")
-   [云项目相关接口](#.E4.BA.91.E9.A1.B9.E7.9B.AE.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "云项目相关接口")
-   [云开发接入相关接口](#.E4.BA.91.E5.BC.80.E5.8F.91.E6.8E.A5.E5.85.A5.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "云开发接入相关接口")
-   [AI模型相关接口](#AI.E6.A8.A1.E5.9E.8B.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "AI模型相关接口")
-   [云服务器相关接口](#.E4.BA.91.E6.9C.8D.E5.8A.A1.E5.99.A8.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "云服务器相关接口")
-   [搜索日志相关接口](#.E6.90.9C.E7.B4.A2.E6.97.A5.E5.BF.97.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "搜索日志相关接口")
-   [SQL型云数据库相关接口](#SQL.E5.9E.8B.E4.BA.91.E6.95.B0.E6.8D.AE.E5.BA.93.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "SQL型云数据库相关接口")
-   [登录配置相关接口](#.E7.99.BB.E5.BD.95.E9.85.8D.E7.BD.AE.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "登录配置相关接口")

## 环境相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeEnvs](/document/api/876/34820) | 获取环境列表 | 100 |
| [DestroyEnv](/document/api/876/42149) | 销毁环境 | 20 |
| [CheckTcbService](/document/api/876/42154) | 检查是否开通Tcb服务 | 20 |
| [CreateBillDeal](/document/api/876/128117) | 创建计费订单 | 20 |
| [DescribeBillingInfo](/document/api/876/94390) | 获取计费相关信息 | 50 |
| [DescribeEnvAccountCircle](/document/api/876/128119) | 查询环境当前计费周期 | 20 |
| [DescribeBaasPackageList](/document/api/876/78167) | 获取新套餐 | 20 |
| [DescribeStaticStore](/document/api/876/128129) | 查看静态托管资源信息 | 20 |
| [CreateStaticStore](/document/api/876/42152) | 创建静态托管资源 | 200 |
| [DescribeSafeRule](/document/api/876/128118) | 查询数据库安全规则 | 20 |
| [DescribeAuthDomains](/document/api/876/42151) | 获取安全域名列表 | 20 |
| [CreateAuthDomain](/document/api/876/42764) | 增加安全域名 | 20 |
| [ModifyEnv](/document/api/876/34818) | 更新环境信息 | 50 |
| [CreateHostingDomain](/document/api/876/42153) | 创建托管域名 | 20 |
| [DestroyStaticStore](/document/api/876/42148) | 销毁静态托管资源 | 20 |
| [DescribeEnvLimit](/document/api/876/42146) | 查询环境个数上限接口 | 20 |
| [DescribeHostingDomainTask](/document/api/876/57514) | 查询静态托管域名任务状态 | 20 |
| [DescribeQuotaData](/document/api/876/42145) | 查询环境的配额使用量 | 2000 |
| [BindStorageSource](/document/api/876/132025) | 云存储绑定外部存储源 | 20 |
| [ModifyStorageSource](/document/api/876/132024) | 更新云存储外部数据源 | 20 |
| [UnbindStorageSource](/document/api/876/132023) | 解绑云存储外部云存储源 | 20 |
| [CreateEnvResource](/document/api/876/129358) | 创建环境相关资源 | 20 |
| [AllocateEnv](/document/api/876/131594) | 从环境池分配环境 | 3000 |
| [ReleaseEnv](/document/api/876/131592) | 释放从环境池里分配的环境 | 1000 |
| [AssumeRoleForAllocatedEnv](/document/api/876/131593) | 为环境池里的环境申请角色临时凭证 | 1000 |

## 用户权限相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DeleteUsers](/document/api/876/127960) | 删除tcb用户 | 20 |
| [CreateUser](/document/api/876/127961) | 创建tcb用户 | 20 |
| [DescribeUserList](/document/api/876/127959) | 查询tcb用户列表 | 20 |
| [ModifyUser](/document/api/876/127958) | 更新tcb用户 | 20 |
| [DescribeResourcePermission](/document/api/876/132256) | 查询资源基础权限 | 20 |
| [ModifyResourcePermission](/document/api/876/132255) | 修改资源基础权限 | 20 |

## 云托管相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeCloudBaseRunServerVersion](/document/api/876/49739) | 查询云托管服务版本的详情 | 1000 |
| [DescribeCloudBaseBuildService](/document/api/876/48345) | 获取云托管代码上传和下载url | 20 |

## 计费相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateEnv](/document/api/876/128592) | 创建环境 | 20 |
| [ModifyEnvPlan](/document/api/876/128591) | 更新云开发环境套餐 | 20 |
| [RenewEnv](/document/api/876/128590) | 续费云开发环境 | 20 |
| [DescribeCreditsUsage](/document/api/876/132935) | 获取资源点用量 | 20 |
| [DescribeCreditsUsageDetail](/document/api/876/132934) | 获取资源点用量明细 | 20 |
| [DescribeEnvPlans](/document/api/876/133103) | 查询环境套餐信息 | 20 |

## 其他接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeGatewayVersions](/document/api/876/129795) | 查询网关版本信息 | 20 |
| [ModifyClsTopic](/document/api/876/81547) | 修改日志主题 | 20 |
| [DescribeCurveData](/document/api/876/129258) | 查询环境监控曲线 | 100 |
| [DeleteAuthDomain](/document/api/876/128960) | 删除合法域名 | 20 |

## 服务操作相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [ModifySafeRule](/document/api/876/128959) | 设置数据库安全规则 | \- |

## 文档型云数据库相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [ModifyDatabaseACL](/document/api/876/34819) | 修改文档型数据库权限 | 50 |
| [DescribeDatabaseACL](/document/api/876/34821) | 获取文档型数据库权限 | 50 |
| [CreateTable](/document/api/876/127968) | 创建文档型数据库表 | 20 |
| [DeleteTable](/document/api/876/127967) | 删除文档型数据库表 | 20 |
| [DescribeTable](/document/api/876/127966) | 查询文档型数据库表信息 | 20 |
| [DescribeTables](/document/api/876/127962) | 查询文档型数据库所有表信息 | 20 |
| [ListTables](/document/api/876/127965) | 查询文档型数据库所有表 | 20 |
| [UpdateTable](/document/api/876/127964) | 修改文档型数据库表索引信息 | 20 |
| [RunCommands](/document/api/876/129012) | 执行文档型数据库命令 | 1000 |

## 云项目相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeCloudAppList](/document/api/876/132936) | 查询云应用服务列表 | 20 |

## 云开发接入相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateHTTPServiceRoute](/document/api/876/129800) | 创建HTTP访问服务路由 | 20 |
| [DeleteHTTPServiceRoute](/document/api/876/129799) | 删除HTTP访问服务路由 | 20 |
| [DescribeHTTPServiceRoute](/document/api/876/129798) | 查询HTTP访问服务路由信息 | 20 |
| [ModifyHTTPServiceRoute](/document/api/876/129797) | 修改HTTP访问服务路由 | 20 |

## AI模型相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateAIModel](/document/api/876/131320) | 创建AI模型 | 20 |
| [DeleteAIModel](/document/api/876/131319) | 删除AI模型 | 20 |
| [DescribeAIModels](/document/api/876/131318) | 查询AI模型列表 | 20 |
| [DescribeManagedAIModelList](/document/api/876/131317) | 查询托管类型AI模型列表 | 20 |
| [UpdateAIModel](/document/api/876/131316) | 更新AI模型 | 20 |

## 云服务器相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateVmInstance](/document/api/876/129796) | 创建服务器实例 | 20 |
| [DeleteVmInstance](/document/api/876/129761) | 销毁服务器实例 | 20 |
| [DescribeVmInstances](/document/api/876/129760) | 查询环境下的服务器实例 | 20 |
| [DescribeVmSpec](/document/api/876/129360) | 获取VM规格 | 20 |
| [InquireVmPrice](/document/api/876/129759) | 查询云服务器价格 | 20 |

## 搜索日志相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [SearchClsLog](/document/api/876/128127) | 搜索CLS日志 | 20 |

## SQL型云数据库相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateMySQL](/document/api/876/128186) | 开通 MySql | 20 |
| [DescribePGUserMigration](/document/api/876/132262) | 查看指定环境单条 migration 详情 | 20 |
| [ListPGUserMigrations](/document/api/876/132261) | 查询目标环境已应用的 Migration | 20 |
| [PreviewPGUserMigrations](/document/api/876/132260) | 预览SQL migrations 在远端的执行计划，不实际执行 SQL | 20 |
| [PushPGUserMigrations](/document/api/876/132259) | 批量应用 Migrations | 20 |
| [RepairPGUserMigrationHistory](/document/api/876/132258) | 修复Migration History | 20 |
| [DescribeCreateMySQLResult](/document/api/876/128185) | 开通 MySql 结果查询 | 20 |
| [DescribeMySQLClusterDetail](/document/api/876/128184) | 查询Mysql集群信息 | 20 |
| [DescribeMySQLTaskStatus](/document/api/876/128183) | 销毁Mysql结果查询 | 20 |
| [DestroyMySQL](/document/api/876/128182) | 销毁MySql | 20 |
| [RunSql](/document/api/876/127880) | 执行MySQL语句 | 100 |
| [ExecutePGSql](/document/api/876/130469) | 在PostgreSQL数据库上执行SQL查询 | 20 |

## 登录配置相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateCustomLoginKey](/document/api/876/130046) | 自定义登录密钥生成 | 20 |
| [DescribeClient](/document/api/876/129355) | 查询应用客户端详情 | 20 |
| [ModifyLoginConfig](/document/api/876/129351) | 修改登录策略 | 20 |
| [DescribeLoginConfig](/document/api/876/129354) | 获取登录策略 | 20 |
| [ModifyClient](/document/api/876/129352) | 修改应用客户端 | 20 |
| [GetProviders](/document/api/876/129353) | 获取三方认证源列表 | 20 |
| [ModifyProvider](/document/api/876/129350) | 修改第三方认证源 | 20 |
| [DeleteProvider](/document/api/876/129356) | 删除第三方认证源 | 20 |
| [AddProvider](/document/api/876/129357) | 添加第三方认证源 | 20 |
| [CreateApiKey](/document/api/876/129835) | 创建云开发平台的API Key | 20 |
| [DeleteApiKey](/document/api/876/129834) | 删除云开发平台的API Key | 20 |
| [DescribeApiKeyList](/document/api/876/129833) | 查询云开发平台的API Key列表 | 20 |

> 注意：
> 
> 以上给出的接口频率限制维度为 `API + 接入地域 + 子账号` ，有关限频更多说明参考： [API 频率限制说明](https://cloud.tencent.com/document/product/1278/109059)