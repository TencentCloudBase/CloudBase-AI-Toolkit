# 需求文档

## 介绍

为 AI 编程用户提供邀请码激活功能。用户可通过 MCP 工具激活邀请码，激活请求由前端发起，后端通过 manager sdk 的 commonService 调用云 API ActivateInviteCode 完成激活。激活结果及错误信息需友好提示用户。

## 需求

### 需求 1 - 激活邀请码

**用户故事：** 作为一名 AI 编程用户，我希望通过 MCP 工具激活邀请码，以便获得相应的激励奖励。

#### 验收标准

1. When 用户在 MCP 工具中输入邀请码时，the MCP 工具 shall 自动获取环境ID并调用 manager sdk 的 commonService 的 ActivateInviteCode 云 API 进行激活，并返回激活结果。
2. When 激活成功时，the MCP 工具 shall 明确提示用户激活成功。
3. When 激活失败时，the MCP 工具 shall 根据后端返回的错误信息，提示用户失败原因（包括但不限于：邀请码无效、不能使用本人邀请码、激活次数已达上限、非新用户、已参与过活动、奖励发放完毕、并发失败需重试等）。
4. While 激活过程中发生异常，the MCP 工具 shall 提示用户“激活失败，请稍后重试”。
5. When 用户未输入邀请码时，the MCP 工具 shall 提示用户补全必填项。 