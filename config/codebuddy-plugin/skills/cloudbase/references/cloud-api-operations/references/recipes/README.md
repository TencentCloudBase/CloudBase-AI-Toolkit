# Recipes — 实证工作流索引

**一个场景一篇文档**，新增 recipe 时在本目录新建 `<场景名>.md`，并登记到下方目录表。

每个 recipe 固定结构：**前置权限 → 接口序列 → 踩坑清单 → 验证步骤**。参数值凡未在 recipe 中标注"实测"的，先对照官方文档确认再使用。

## 目录

| # | Recipe | 文档 | 状态 |
| --- | --- | --- | --- |
| 1 | PostgreSQL 存储空间使用率告警 | [pg-storage-alarm.md](./pg-storage-alarm.md) | ✅ 生产实证（2026-09-08） |
| 2 | 依赖产品资源告警（MySQL/CVM 等） | 复用 Recipe 1 框架，换 namespace | 📋 计划 |
| 3 | MySQL 备份回档 | 待补 | 📋 计划 |
| 4 | SCF 函数触发器 | 待补（api-reference 依赖产品段已有指引） | 📋 计划 |

## 官方 API 文档入口（供 recipe 撰写时核对）

- **监控/告警（腾讯云可观测平台）**：API 概览 https://cloud.tencent.com/document/product/649/30343 ；单个 Action 详细文档在 `document/api/248/` 下（例：CreateAlarmPolicy https://cloud.tencent.com/document/api/248/51287 ）
- **其他产品**：从 https://cloud.tencent.com/document/api 进入对应产品 API 中心，Action 名与参数先经官方文档确认，再写入 recipe。
