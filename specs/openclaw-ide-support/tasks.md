# 实施计划

- [ ] 1. 补充 OpenClaw 数据项与官方图标来源
  - 为 OpenClaw 确认统一的 `id`、名称、平台描述和官方 logo URL
  - 确保后续各个列表与组件都复用同一套 OpenClaw 展示信息
  - _需求: 需求 1, 需求 3_

- [ ] 2. 扩展 IDE 选择与图标组件
  - 在 `doc/components/IDESelector.tsx` 中新增 OpenClaw 配置项，复用命令安装渲染分支
  - 在 `doc/components/IDEIconGrid.tsx` 中新增 OpenClaw，并将排序调整到 Cursor 之前
  - 在 `doc/components/ErrorCodeIDEButton.tsx` 的热门 IDE 图标列表中补充 OpenClaw，并使用官方 logo
  - _需求: 需求 1, 需求 3_

- [ ] 3. 新增 OpenClaw 独立接入文档与导航
  - 创建 `doc/ide-setup/openclaw.mdx`
  - 在 `doc/sidebar.json` 中加入 OpenClaw 页面，并将位置前置到 Cursor 之前
  - 在 OpenClaw 页面中说明可以直接对 AI 说“安装 CloudBase Skills”，同时给出 `npx skills add tencentcloudbase/cloudbase-skills -y`
  - _需求: 需求 1, 需求 2, 需求 3_

- [ ] 4. 重构 IDESelector 的安装与 prompt 流程
  - 移除或替换 `doc/components/IDESelector.tsx` 中原有的模板推荐提示
  - 将第二步改为两段式 Skills 引导：
    - 第一条改为完整安装 prompt：“安装 CloudBase Skills：执行如下命令 npx skills add tencentcloudbase/cloudbase-skills -y”
    - 保留随机业务 prompt，但在每条 prompt 前补充“使用 CloudBase Skills”进入实际业务场景
  - 调整复制 prompt 与 “Open with Cursor” 深链内容，使其与新的两步流程一致
  - _需求: 需求 5_

- [ ] 5. 更新对外支持列表与说明文档
  - 更新 `README.md`、`mcp/README.md`、`doc/index.mdx`、`doc/faq.md`，补充 OpenClaw 条目并前置排序
  - 检查所有与 Cursor 并列展示的 AI IDE 列表，补齐 OpenClaw
  - _需求: 需求 1, 需求 3_

- [ ] 6. 统一 Skills 安装口径
  - 更新 `doc/prompts/how-to-use.mdx` 及其它 Skills 安装说明，将通用推荐命令统一为 `npx skills add tencentcloudbase/cloudbase-skills`
  - 确保 OpenClaw 专属章节使用带 `-y` 的命令
  - 清理仅展示 `tencentcloudbase/cloudbase-skills` 包名或其它不一致写法
  - _需求: 需求 2, 需求 4_

- [ ] 7. 验证排序、图标与文案一致性
  - 通过全文检索确认 OpenClaw 已出现在所有目标组件和文档入口中
  - 检查 OpenClaw 排序是否均在 Cursor 之前
  - 检查通用 Skills 命令与 OpenClaw 章节命令是否分别符合规格
  - 检查 `IDESelector` 的两步 Skills 引导、复制按钮与深链打开内容是否正确
  - _需求: 需求 1, 需求 2, 需求 3, 需求 4, 需求 5_
