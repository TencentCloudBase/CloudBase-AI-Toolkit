/**
 * 自动生成的 TCB 对外 API Action 列表
 * 从 references/ 目录下的文档中提取
 *
 * ⚠️ 请勿手动编辑此文件，由 scripts/generate-actionlist.ts 自动生成
 *
 * Action 数量: 53
 */

const TCB_ALLOWED_ACTIONS: string[] = [
  'BindCloudBaseAccessDomain',
  'BindCloudBaseGWDomain',
  'CheckTcbService',
  'CreateAuthDomain',
  'CreateBillDeal',
  'CreateCloudBaseGWAPI',
  'CreateEnv',
  'CreateHostingDomain',
  'CreateMySQL',
  'CreateStaticStore',
  'CreateTable',
  'CreateUser',
  'DeleteAuthDomain',
  'DeleteCloudBaseGWAPI',
  'DeleteCloudBaseGWDomain',
  'DeleteTable',
  'DeleteUsers',
  'DescribeAuthDomains',
  'DescribeBaasPackageList',
  'DescribeCloudBaseBuildService',
  'DescribeCloudBaseGWAPI',
  'DescribeCloudBaseGWService',
  'DescribeCreateMySQLResult',
  'DescribeDatabaseACL',
  'DescribeEnvAccountCircle',
  'DescribeEnvLimit',
  'DescribeEnvs',
  'DescribeHostingDomainTask',
  'DescribeMySQLClusterDetail',
  'DescribeMySQLTaskStatus',
  'DescribeQuotaData',
  'DescribeSafeRule',
  'DescribeStaticStore',
  'DescribeTable',
  'DescribeTables',
  'DescribeUserList',
  'DestroyEnv',
  'DestroyMySQL',
  'DestroyStaticStore',
  'EditAuthConfig',
  'ListTables',
  'ModifyCloudBaseGWAPI',
  'ModifyClsTopic',
  'ModifyDatabaseACL',
  'ModifyEnv',
  'ModifyEnvPlan',
  'ModifySafeRule',
  'ModifyUser',
  'ReinstateEnv',
  'RenewEnv',
  'RunSql',
  'SearchClsLog',
  'UpdateTable',
];

export default TCB_ALLOWED_ACTIONS;
