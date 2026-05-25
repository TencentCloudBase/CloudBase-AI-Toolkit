# Changelog

All notable changes to this project will be documented in this file. Follow the repository's conventional commit guidelines and release workflow documentation when preparing releases.

## [1.7.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.6.0...v1.7.0) (2025-06-10)


### 其他

* update doc ([bd49e04](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bd49e0488b5ebcd16dd5d9c19a9ca801b1b0942c))


### 新功能

* 新增 login 工具交互式选择环境,新增 interactiveDialog 统一的交互式对话工具，支持需求澄清和任务确认，当需要和用户确认下一步的操作的时候，可以调用这个工具的clarify，如果有敏感的操作，需要用户确认，可以调用这个工具的confirm ([d7d5293](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d7d5293d8fc1611c9363fa45d743e637da07266e))
* 增加规则 交互式反馈规则：在需求不明确时主动与用户对话澄清，优先使用自动化工具完成配置。执行高风险操作前必须获得用户确认。环境管理通过login/logout工具完成，交互对话使用interactiveDialog工具处理需求澄清和风险确认。简单修改无需确认，关键节点（如部署、数据删除）需交互，保持消息简洁并用emoji标记状态。 ([c234e9a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/c234e9a065fc23181125cacafcee0a6d75773762))

## [1.6.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.5.0...v1.6.0) (2025-06-06)


### 其他

* add cnb badge ([3eabacd](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3eabacd1c27d6d201a3c7987402d795f5b895043))
* add cursor install link ([cf712a9](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/cf712a9315a63bdd610c2274878ec8027e65856c))
* add product-banner ([40e5532](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/40e553265b61d8bc62e993b53fe77cc779263bba))
* function runtime add SUPPORTED_NODEJS_RUNTIMES ([fd11d16](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fd11d169f986453bc6a573c38e0e97ada3b8a982)), closes [#3](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues/3)
* update mcp log ([9aa03c8](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9aa03c8e1d41d90846aba144378c381d2d7f81ed))
* update rules for envId not found ([0bbd874](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/0bbd87466606c69e48f092870a820cab94f95b8f))


### 新功能

* add rules for cross db query ([de52863](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/de52863f5546f2af667a1477189bcdef7dbb80fe))
* add universal templte ([3a6f55d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3a6f55d3dc98a08761c2393bc104b5effbb3f7d9))
* support ai download template ([502fff1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/502fff1526d6879d4e4f4a8b9a3559bd8cd7f8fd))
* support miniprogram knowlege ([0ff5193](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/0ff5193dcce86f3cc214b9d2d3d1ce42356e5b5f))

## [1.5.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.4.0...v1.5.0) (2025-06-04)


### 修复

* function install Deps ([fffd16a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fffd16a120642d35dd115539301c05b12ffdbf9e))


### 新功能

* 支持文心快码 Comate ([1df3806](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/1df38060221373fdd41f817c3bffe11412ac4ebd))


### 其他

* update doc ([62132cf](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/62132cff9f10f60a4cb664cd43ec220c2b8dcd3a))
* update rules ([a4f9e92](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/a4f9e92b1d368e330a6df519a0246a4d600d4d0d))
* update searchKnowledgeBase tools name ([80353a6](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/80353a63f44666ad869e73c3149e10751c54af8e))

## [1.4.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.1.0...v1.4.0) (2025-05-30)


### 其他

* fix docs ([9b998fe](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9b998fed7abfb0b8a9eccf8350c03bbfa2ca7d7a))
* update doc ([af460bd](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/af460bdf2d29c65c8f9ba661cf591c3e2e4cbdd2))
* update download link ([718a065](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/718a065c055940bd3ee85f1e0afb8819afece901))


### 新功能

* **mcp:** support searchKnowledgeBase tool 智能检索云开发知识库（支持云开发与云函数），通过向量搜索快速获取专业文档与答案 ([cf69963](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/cf699637ad3a2135fbfe2edcbe410e3398672d51))
* support roocode ([f32ac6c](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f32ac6c9f0a8ff47818e44d6d6538e6dc48c9117))
* support RooCode ([2d1542d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2d1542d61cecee724f0588e805b9134932aba025))
* support tongyi lingma ([b7d2de0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/b7d2de0f819b69201fdbd0da9562a03420590c0b))
* support tongyi lingma ([02c77f1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/02c77f12e7092c103aca7a867edf4e61556eebfa))

## 1.3.0 (2025-05-28)


### 新功能

* 优化小程序规则 ([b3d8873](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/b3d8873ba2c6540f65f9fdf5ff8b088214743e0d))
* **init:** init project ([bd25a53](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bd25a53188151ecf63c45e8c569f3a1c5115920f))
* mcp 支持登出功能 ([d2de655](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d2de6555af8816670c01338320a47df3be2f8bca))
* support web auth ([375c70e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/375c70ec4d665cf32e4273cbc930d3f84e05dbec))
* update config,support web auth ([870f3d4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/870f3d4c363970646b0e823587185cefea83bfbc))


### 修复

* **mcp:** 修复 logout 出参的问题 ([3a4e0a4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3a4e0a446e73259fc167c82468f0a096bdad235b))
* update function deploy rules ([2892b07](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2892b07ddf07fe081ea5c6fe1db5b01c32962722))
* windsurf error ([500dfd7](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/500dfd7556dca558ec42d58e38bfdfdaee0bd96b))


### 其他

* 默认使用最新版本的 mcp ([43b3faf](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/43b3faff99f7210aa244d0a5bd7da0090b725718))
* add scripts ([f3e9686](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f3e968635943b4335cbad60464b669340e953ede))
* fix doc ([6029e16](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6029e164148c73cdefa93f85626ccb27a1093dfc))
* fix envId config ([c1d0715](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/c1d0715f08c82f6183c3e6e6686769977efe34bd))
* update config ([d734d27](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d734d272579e10b53bf7dd4d00d28c3bcd801a8c))
* update doc ([5d66e1b](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/5d66e1bb5502bfccedfdb54067fa3b6c4973d929))
* update doc ([736d78a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/736d78a76905e470aae2b1881eb15424f85d25c6))
* update doc ([f377e23](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f377e23317842b24c765d1f420898a8064199ce8))
* update doc ([167f3ba](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/167f3ba530571c41185aea92631f450fe42669fe))
* update doc ([fdb7e57](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fdb7e57d7e4587cd9fe6dfb1f020332c668fc1cf))
* update doc ([d1586d6](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d1586d6b02c2e646f7c5baa62400c7d8eb21d746))
* update doc ([696f5b0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/696f5b0437894f70809177c61267bbb0d5cfdef2))
* update doc ([456b812](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/456b812e805382d1f45eed53b05f52dc32e385d4))
* update doc ([545212e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/545212e9d1dc34934cca63c3ddb13f3475668bda))
* update doc ([1b39cc1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/1b39cc16437dc0ca8244292d02e684838955a9a7))
* update doc ([be97279](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/be972795622ae739a54377ef9bbcdf9178dd804c))
* update README.md ([9003abb](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9003abba3412b9a30e25dd0c31f82074e7024a35))
* update rules ([baf6e86](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/baf6e861edefd64263228579f0172ab9162cd78b))
* update rules ([dd3e48d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/dd3e48dfb4c68921b0bc2a5ffd39cd8728256918))

## ## 1.2.1 (2025-05-28)

* chore: 默认使用最新版本的 mcp ([43b3faf](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/43b3faf))
* chore: add scripts ([f3e9686](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f3e9686))
* chore: fix doc ([6029e16](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6029e16))
* chore: fix envId config ([c1d0715](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/c1d0715))
* chore: update config ([d734d27](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d734d27))
* chore: update doc ([5d66e1b](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/5d66e1b))
* chore: update doc ([736d78a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/736d78a))
* chore: update doc ([f377e23](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f377e23))
* chore: update doc ([167f3ba](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/167f3ba))
* chore: update doc ([fdb7e57](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fdb7e57))
* chore: update doc ([d1586d6](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d1586d6))
* chore: update doc ([696f5b0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/696f5b0))
* chore: update doc ([456b812](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/456b812))
* chore: update doc ([545212e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/545212e))
* chore: update doc ([1b39cc1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/1b39cc1))
* chore: update doc ([be97279](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/be97279))
* chore: update README.md ([9003abb](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9003abb))
* chore: update rules ([baf6e86](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/baf6e86))
* chore: update rules ([dd3e48d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/dd3e48d))
* fix: update function deploy rules ([2892b07](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2892b07))
* fix: windsurf error ([500dfd7](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/500dfd7))
* fix(mcp): 修复 logout 出参的问题 ([3a4e0a4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3a4e0a4))
* doc: add demo video ([6ac5189](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6ac5189))
* doc: update codebuddy rules doc ([f396d85](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f396d85))
* doc: update doc ([e16465c](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/e16465c))
* doc: update doc ([2e13ddb](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2e13ddb))
* doc: update doc ([77c0e52](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/77c0e52))
* doc: update doc ([63d4639](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/63d4639))
* doc: update doc ([bf2b588](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bf2b588))
* doc: update doc ([7b4adf1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/7b4adf1))
* doc: update doc ([82458e9](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/82458e9))
* doc: update doc ([0d96e60](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/0d96e60))
* doc: update doc ([ff8e084](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/ff8e084))
* doc: update doc ([61b7b2e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/61b7b2e))
* doc: update readme ([5e2d30c](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/5e2d30c))
* doc: update tool list ([6dc4859](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6dc4859))
* doc: update wechat qrcode ([af1f216](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/af1f216))
* feat: 优化小程序规则 ([b3d8873](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/b3d8873))
* feat: mcp 支持登出功能 ([d2de655](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d2de655))
* feat: support web auth ([375c70e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/375c70e))
* feat: update config,support web auth ([870f3d4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/870f3d4))
* feat(init): init project ([bd25a53](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bd25a53))
