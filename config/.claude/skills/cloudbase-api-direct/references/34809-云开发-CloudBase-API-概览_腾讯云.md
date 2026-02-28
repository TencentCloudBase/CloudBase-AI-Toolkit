[API 中心](/document/api)

## API 概览

最近更新时间：2026-02-13 02:04:10

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
-   [其他接口](#.E5.85.B6.E4.BB.96.E6.8E.A5.E5.8F.A3 "其他接口")
-   [云数据库相关接口](#.E4.BA.91.E6.95.B0.E6.8D.AE.E5.BA.93.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "云数据库相关接口")
-   [云开发接入相关接口](#.E4.BA.91.E5.BC.80.E5.8F.91.E6.8E.A5.E5.85.A5.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "云开发接入相关接口")

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
| [SearchClsLog](/document/api/876/128127) | 搜索CLS日志 | 20 |
| [ModifyEnv](/document/api/876/34818) | 更新环境信息 | 50 |
| [CreateEnv](/document/api/876/128592) | 创建环境 | 20 |
| [ModifyEnvPlan](/document/api/876/128591) | 更新云开发环境套餐 | 20 |
| [RenewEnv](/document/api/876/128590) | 续费云开发环境 | 20 |

## 用户权限相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DeleteUsers](/document/api/876/127960) | 删除tcb用户 | 20 |
| [CreateUser](/document/api/876/127961) | 创建tcb用户 | 20 |
| [DescribeUserList](/document/api/876/127959) | 查询tcb用户列表 | 20 |
| [EditAuthConfig](/document/api/876/117012) | 编辑登录配置 | 20 |
| [ModifyUser](/document/api/876/127958) | 更新tcb用户 | 20 |

## 云托管相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeCloudBaseRunServerVersion](/document/api/876/49739) | 查询云托管服务版本的详情 | 1000 |
| [DescribeCloudBaseBuildService](/document/api/876/48345) | 获取云托管代码上传和下载url | 20 |

## 其他接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CommonServiceAPI](/document/api/876/41230) | TCB云API统一入口 | 500 |
| [BindEnvGateway](/document/api/876/59324) | 绑定环境网关 | 20 |
| [CreateHostingDomain](/document/api/876/42153) | 创建托管域名 | 20 |
| [DeleteCloudBaseRunServerVersion](/document/api/876/58477) | 删除服务版本 | 1000 |
| [DeleteGatewayVersion](/document/api/876/94391) | 删除网关某版本 | 20 |
| [DeleteWxGatewayRoute](/document/api/876/54393) | 删除安全网关路由 | 20 |
| [DescribeActivityRecord](/document/api/876/59181) | 查询活动记录信息 | 20 |
| [DescribeCloudBaseRunResource](/document/api/876/50108) | 查看容器托管的资源状态 | 20 |
| [DescribeCloudBaseRunResourceForExtend](/document/api/876/50313) | 查看容器托管的资源状态扩展使用 | 20 |
| [DescribeCloudBaseRunServer](/document/api/876/63346) | 查询单个服务的详情 | 100 |
| [DescribeCloudBaseRunVersion](/document/api/876/53438) | 查询服务版本详情 | 20 |
| [DescribeEnvFreeQuota](/document/api/876/43848) | 查询后付费免费配额信息 | 20 |
| [DescribeEnvPostpaidDeduct](/document/api/876/58755) | 查询环境后付费计费详情 | 20 |
| [DescribeGatewayVersions](/document/api/876/94388) | 查询网关版本信息 | 20 |
| [DescribeSpecialCostItems](/document/api/876/58754) | 查询环境1分钱抵扣信息 | 20 |
| [DescribeUserActivityInfo](/document/api/876/61162) | 查询用户活动信息 | 20 |
| [DescribeWxGatewayRoutes](/document/api/876/94387) | 查看安全网关路由 | 20 |
| [DescribeWxGateways](/document/api/876/94386) | 查看安全网关 | 20 |
| [DestroyStaticStore](/document/api/876/42148) | 销毁静态资源 | 20 |
| [EstablishCloudBaseRunServer](/document/api/876/49626) | 创建云应用服务 | 1000 |
| [FreezeCloudBaseRunServers](/document/api/876/71436) | 批量冻结 | 20 |
| [ModifyCloudBaseRunServerFlowConf](/document/api/876/58232) | 修改容器内的版本流量配置 | 100 |
| [ModifyCloudBaseRunServerVersion](/document/api/876/63949) | 修改服务版本信息 | 1000 |
| [ModifyGatewayVersionTraffic](/document/api/876/94385) | 设置网关版本的流量比例 | 20 |
| [ReplaceActivityRecord](/document/api/876/59180) | 更新活动详情 | 20 |
| [UnfreezeCloudBaseRunServers](/document/api/876/71435) | 批量解冻服务 | 20 |
| [CreateCloudBaseRunResource](/document/api/876/49628) | 开通容器托管的资源 | 20 |
| [DescribeEnvDealRegion](/document/api/876/60995) | 获取环境下单地域 | 20 |
| [EstablishWxGatewayRoute](/document/api/876/54392) | 创建或修改安全网关路由 | 20 |
| [CreateCloudBaseRunServerVersion](/document/api/876/49627) | 创建服务版本 | 1000 |
| [DescribeCbrServerVersion](/document/api/876/94389) | 查询服务版本的详情 | 20 |
| [DescribeGatewayCurveData](/document/api/876/89118) | 查询网关监控数据 | 20 |
| [DeleteCloudBaseProjectLatestVersion](/document/api/876/51097) | 删除云项目 | 20 |
| [DescribeDownloadFile](/document/api/876/49049) | 获取下载文件信息 | 20 |
| [DescribeExtensionUploadInfo](/document/api/876/53704) | 描述扩展上传文件信息 | 20 |
| [ModifyClsTopic](/document/api/876/81547) | 修改日志主题 | 20 |
| [ModifyDatabaseACL](/document/api/876/34819) | 修改数据库权限 | 50 |
| [DescribeCloudBaseProjectLatestVersionList](/document/api/876/52615) | 获取云开发项目列表 | 10 |
| [DescribeCloudBaseProjectVersionList](/document/api/876/54302) | 云项目部署版本列表 | 20 |
| [CreateAndDeployCloudBaseProject](/document/api/876/52616) | 创建云开发项目 | 20 |
| [DescribeCloudBaseRunVersionSnapshot](/document/api/876/48528) | 查询版本历史 | 20 |
| [DescribeCurveData](/document/api/876/59512) | 查询环境监控曲线 | 100 |
| [DescribeGraphData](/document/api/876/96277) | 查询环境的监控曲线数据 | 20 |
| [DescribeDatabaseACL](/document/api/876/34821) | 获取数据库权限 | 50 |
| [DescribeEnvLimit](/document/api/876/42146) | 查询环境个数上限接口 | 20 |
| [DescribeExtraPkgBillingInfo](/document/api/876/44747) | 获取增值包计费相关信息 | 20 |
| [DescribeHostingDomainTask](/document/api/876/57514) | 查询静态托管域名任务状态 | 20 |
| [DescribeQuotaData](/document/api/876/42145) | 查询环境的配额使用量 | 2000 |
| [ReinstateEnv](/document/api/876/42144) | 恢复环境，解除隔离状态 | 20 |
| [DescribePostpayFreeQuotas](/document/api/876/51672) | 查询后付费资源免费用量 | 20 |
| [DescribePostpayPackageFreeQuotas](/document/api/876/45040) | 获取后付费免费额度 | 20 |
| [DescribeSmsQuotas](/document/api/876/52410) | 查询后付费短信资源量 | 20 |
| [CreatePostpayPackage](/document/api/876/45287) | 开通后付费资源 | 2 |

## 云数据库相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateTable](/document/api/876/127968) | 创建表 | 20 |
| [DeleteTable](/document/api/876/127967) | 删除表 | 20 |
| [DescribeTable](/document/api/876/127966) | 查询表信息 | 20 |
| [DescribeTables](/document/api/876/127962) | 查询所有表信息 | 20 |
| [ListTables](/document/api/876/127965) | 查询所有表 | 20 |
| [UpdateTable](/document/api/876/127964) | 修改表索引信息 | 20 |
| [CreateMySQL](/document/api/876/128186) | 开通 MySql | 20 |
| [DescribeCreateMySQLResult](/document/api/876/128185) | 开通 MySql 结果查询 | 20 |
| [DescribeMySQLClusterDetail](/document/api/876/128184) | 查询Mysql集群信息 | 20 |
| [DescribeMySQLTaskStatus](/document/api/876/128183) | 销毁Mysql结果查询 | 20 |
| [DestroyMySQL](/document/api/876/128182) | 销毁MySql | 20 |
| [RunSql](/document/api/876/127880) | 执行SQL语句 | 20 |

## 云开发接入相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [DescribeCloudBaseGWAPI](/document/api/876/128121) | 获取网关API列表 | 100 |
| [DescribeCloudBaseGWService](/document/api/876/128120) | 获取网关服务 | 2000 |
| [CreateCloudBaseGWAPI](/document/api/876/128124) | 创建云开发网关API | 100 |
| [DeleteCloudBaseGWAPI](/document/api/876/128123) | 删除网关API | 100 |
| [ModifyCloudBaseGWAPI](/document/api/876/128128) | 修改云开发网关API | 20 |
| [DeleteCloudBaseGWDomain](/document/api/876/128122) | 删除网关域名 | 20 |
| [BindCloudBaseGWDomain](/document/api/876/128125) | 绑定自定义域名 | 20 |
| [BindCloudBaseAccessDomain](/document/api/876/128126) | 绑定云开发自定义域名 | 100 |

> 注意：
> 
> 以上给出的接口频率限制维度为 `API + 接入地域 + 子账号` ，有关限频更多说明参考： [API 频率限制说明](https://cloud.tencent.com/document/product/1278/109059)

目录