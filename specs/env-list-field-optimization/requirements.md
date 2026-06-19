# 需求文档

## 介绍

环境列表查询接口（`envQuery` 工具的 `action="list"`）目前直接透传了 `DescribeEnvs` API 返回的完整环境列表数据，当用户拥有较多环境时，返回的数据量可能过大，导致超过 LLM 的 token 限制，影响系统性能和可用性。

需要分析并精简 **MCP 工具返回给 AI 助手**的环境列表字段，只保留必要且有用的字段，以减少数据传输量和 token 消耗。

**重要说明：** 交互式界面（WebSocket、HTML 页面）不受 MCP token 限制，可以保持完整数据。本需求仅针对 MCP 工具返回给 AI 的数据进行优化。

## 需求

### 需求 1 - 精简 MCP 工具返回的环境列表字段

**用户故事：** 作为 AI 助手，当通过 `envQuery` 工具查询环境列表时，我希望只获取必要且有用的字段信息，以减少 token 消耗并提高响应速度，同时保留足够的信息帮助我做出正确的环境选择。

#### 验收标准

1. When `envQuery` 工具被调用且 `action="list"` 时，the 系统 shall 对返回给 AI 助手的环境列表数据进行字段精简，只保留必要且有用的字段（需要先分析 `DescribeEnvs` API 返回的完整结构，确定哪些字段对 AI 助手有用）。

2. When 精简字段时，the 系统 shall 至少保留以下核心字段：
   - `EnvId` - 环境ID（必需，用于标识和选择环境）
   - `Alias` - 环境别名（必需，用于显示和识别环境）

3. When 精简字段时，the 系统 shall 保留以下有用的字段（基于实际 API 返回结构分析）：
   - `EnvId` - 环境ID（必需）
   - `Alias` - 环境别名（必需）
   - `Status` - 环境状态（如 "NORMAL"，用于判断环境可用性）
   - `EnvType` - 环境类型（"baas" 或 "weda"，用于区分环境类型）
   - `Region` - 地域（如 "ap-shanghai"，用于了解环境部署位置）
   - `PackageId` - 套餐ID（用于识别具体套餐档位，支持自动化评测和程序化判断）
   - `PackageName` - 包名称（如 "个人版"、"免费版"，用于了解环境套餐类型）
   - `IsDefault` - 是否为默认环境（用于标识默认环境）

4. When 精简字段时，the 系统 shall 移除以下对 AI 助手不太有用但占用大量 token 的字段：
   - `Databases` - 数据库详细信息数组
   - `Storages` - 存储详细信息数组
   - `Functions` - 函数详细信息数组
   - `LogServices` - 日志服务详细信息数组
   - `StaticStorages` - 静态存储详细信息数组
   - `Tags` - 标签数组
   - `EnvPreferences` - 环境偏好设置
   - `CreateTime` - 创建时间（对 AI 助手选择环境不太有用）
   - `UpdateTime` - 更新时间（对 AI 助手选择环境不太有用）
   - `Source` - 来源信息（对 AI 助手选择环境不太有用）
   - `PackageType` - 包类型（已有 EnvType，信息重复）
   - `EnvStatus` - 环境状态（与 Status 重复）
   - `IsAutoDegrade` - 是否自动降级（对 AI 助手不太有用）
   - `EnvChannel` - 环境渠道（对 AI 助手不太有用）
   - `PayMode` - 付费模式（对 AI 助手不太有用）
   - `IsDauPackage` - 是否为 DAU 包（对 AI 助手不太有用）
   - `CustomLogServices` - 自定义日志服务（对 AI 助手不太有用）

5. When 环境列表数据被返回给 AI 助手时，the 系统 shall 确保精简后的数据格式与现有使用场景兼容，不影响环境选择、过滤和验证功能。

6. When 降级到 `listEnvs()` 方法时，the 系统 shall 同样对返回的数据进行字段精简处理。

7. When 精简字段后，the 系统 shall 确保不影响其他功能模块对环境列表的使用（如环境验证、环境 ID 提取等）。

8. **交互式界面不受影响：** When 环境列表在交互式界面中使用时（WebSocket、HTML 页面），the 系统 shall 保持完整的数据结构，不受字段精简影响。

## 字段分析结果

基于实际 API 调用结果，每个环境对象包含约 20+ 个字段，其中：
- **核心字段**（8个）：`EnvId`, `Alias`, `Status`, `EnvType`, `Region`, `PackageId`, `PackageName`, `IsDefault`
- **详细资源信息**（占用大量 token）：`Databases`, `Storages`, `Functions`, `LogServices`, `StaticStorages` 等数组字段
- **其他元数据**：`CreateTime`, `UpdateTime`, `Source`, `Tags`, `EnvPreferences` 等

**精简效果预估：** 单个环境对象从约 2000+ 字符减少到约 200-300 字符，减少约 85-90% 的数据量。当环境数量较多时（如 10+ 个环境），可显著减少 token 消耗。
