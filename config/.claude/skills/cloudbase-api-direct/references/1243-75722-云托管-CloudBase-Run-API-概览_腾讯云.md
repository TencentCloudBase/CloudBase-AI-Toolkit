[API 中心](/document/api)

## API 概览

最近更新时间：2026-04-16 02:13:18

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 本页目录：

-   [服务相关接口](#.E6.9C.8D.E5.8A.A1.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "服务相关接口")
-   [环境相关接口](#.E7.8E.AF.E5.A2.83.E7.9B.B8.E5.85.B3.E6.8E.A5.E5.8F.A3 "环境相关接口")

## 服务相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateCloudRunServer](/document/api/1243/75712) | 创建云托管服务 | 20 |
| [StartVersionInstance](/document/api/1243/130559) | 启动版本实例 | 20 |
| [StopVersionInstance](/document/api/1243/130558) | 停止版本实例 | 20 |
| [DeleteCloudRunServer](/document/api/1243/126761) | 删除云托管服务 | 20 |
| [DeleteCloudRunVersions](/document/api/1243/126760) | 批量删除版本 | 20 |
| [DescribeCloudRunDeployRecord](/document/api/1243/126759) | 查询云托管部署记录 | 20 |
| [DescribeCloudRunPodList](/document/api/1243/126758) | 查询云托管Pod实例列表接口 | 20 |
| [DescribeCloudRunProcessLog](/document/api/1243/126757) | 查询运行日志 | 20 |
| [DescribeCloudRunServerDetail](/document/api/1243/75711) | 查询云托管服务详情 | 20 |
| [DescribeCloudRunServers](/document/api/1243/75710) | 查询云托管服务列表 | 20 |
| [DescribeVersionDetail](/document/api/1243/126755) | 查询版本详情 | 20 |
| [DescribeReleaseOrder](/document/api/1243/126756) | 查询发布单 | 20 |
| [DescribeServerManageTask](/document/api/1243/76021) | 查询服务管理任务信息 | 20 |
| [OperateServerManage](/document/api/1243/75873) | 操作发布单 | 20 |
| [ReleaseGray](/document/api/1243/75872) | 灰度发布 | 20 |
| [SearchClsLog](/document/api/1243/126754) | 查询日志cls日志信息 | 20 |
| [SubmitServerRollback](/document/api/1243/126753) | 回滚版本 | 20 |
| [UpdateCloudRunServer](/document/api/1243/75709) | 更新云托管服务 | 20 |

## 环境相关接口

| 接口名称 | 接口功能 | 频率限制（次/秒） |
| --- | --- | --- |
| [CreateCloudRunEnv](/document/api/1243/75707) | 创建环境 | 20 |
| [DescribeCloudRunEnvs](/document/api/1243/75706) | 查询云托管环境列表 | 20 |
| [DescribeEnvBaseInfo](/document/api/1243/75701) | 查询环境基础信息 | 20 |

> 注意：
> 
> 以上给出的接口频率限制维度为 `API + 接入地域 + 子账号` ，有关限频更多说明参考： [API 频率限制说明](https://cloud.tencent.com/document/product/1278/109059)