# 微信小程序开发常见陷阱

本文汇总真实项目中的高频错误。生成代码前请当作预检清单使用。

## 1. 可选链（`?.`）与现代语法

**问题**：许多基础库与微信开发者工具版本不支持可选链（`obj?.prop`）或空值合并（`??`）。

**正确做法**：
- 使用传统 `if` 判断，或 `&&` / `||` 模式。
- 仅在真正需要时，才用 `wx.getSystemInfoSync()` + 版本判断。

**应避免的示例**：
```js
const name = user?.name ?? 'Guest';   // 经常直接报错
```

**安全写法**：
```js
const name = (user && user.name) || 'Guest';
```

## 2. TDesign 组件样式（尤其 `::after`）

**问题**：TDesign 组件用伪元素做边框、图标和状态。用简单 class 选择器覆盖经常无效。

**要点**：
- 尽量使用 TDesign 提供的 CSS 自定义属性（变量）。
- 覆盖 `::after` / `::before` 时注意提高优先级；`!important` 仅作最后手段。
- 在真机上验证 —— 开发者工具预览可能掩盖渲染差异。

**推荐模式**：
```css
/* 优先用变量 */
.t-button {
  --td-button-border-color: transparent;
}

/* 必要时再回退到 ::after */
.custom-cell::after {
  border-color: var(--td-border-color, #e5e5e5) !important;
}
```

## 3. 小游戏 Canvas + 云存储权限

**问题**：Canvas 绘制后保存到云存储，常因权限或上下文问题失败。

**检查清单**：
- 按目标基础库正确使用 `wx.createCanvasContext`（2D）或 `wx.createOffscreenCanvas`。
- 申请 `scope.writePhotosAlbum`，或用 `canvasToTempFilePath` + `wx.cloud.uploadFile` 并处理好鉴权。
- 云存储路径须指向正确环境，且存储权限规则允许该 openid 或角色。

**常见失败**：
把 Canvas 存成图片再上传时，临时文件路径处理不正确。

## 4. 环境与代码配置漂移

**问题**：开发者工具所选环境与代码中实际使用的云环境不一致。

**预防**：
- 始终核对 `project.config.json` → `cloudbaseRoot` 与 `appid`。
- 显式调用 `wx.cloud.init({ env: 'your-real-env-id' })`。
- 在开发者工具中切换云环境后，重启模拟器。
- 使用 `miniprogram-ci` 做 CI/CD 时，IP 白名单须包含构建机。

## 5. 消息推送 / 客服自动回复

**问题**：agent 教授底层绕过、省略 `--remote-npm-install`，或误以为函数返回值会回复聊天。

**正确做法**：遵循 [message-push-customer-service.md](message-push-customer-service.md) —— 仅用 IDE / wxide CLI；回复走 OpenAPI `customerServiceMessage.send`；CLI 尚未提供消息推送与日志查询能力，不要教授底层绕过。

## 6. 云开发入口置灰 / 选不到环境

**问题**：开发者工具里「云开发」按钮是灰的、点不动；或按钮正常但环境列表里找不到已有环境。两种现象常被误判为工具故障或云开发故障。

**先分成因，再给动作** —— 五类成因的处置完全不同：

| 成因 | 怎么认 | 动作 |
| --- | --- | --- |
| 项目用的是**微信测试号** | 详情 → 基本信息里的 AppID 是测试号 | 测试号不支持云开发，换正式注册的小程序账号 |
| 小程序**授权过第三方服务商**使用云开发 | 公众平台 → 设置 → 第三方设置 | 先在公众平台解绑 |
| 当前登录微信**不是该小程序的管理员/开发者** | 比对登录身份与小程序成员列表 | 换管理员/开发者微信重新扫码 |
| 项目是**公众号**不是小程序 | 项目类型 | 公众号不能开云开发，只能走[环境共享](https://developers.weixin.qq.com/minigame/dev/wxcloud/basis/resource-sharing.html) |
| **小程序绑定的腾讯云账号与建环境的账号不一致**（含环境建在腾讯云侧） | 环境在腾讯云控制台能看到、工具里看不到 | 核对账号 → 换绑 →「使用已有腾讯云环境」导入，见 [cloudbase-integration.md](cloudbase-integration.md) §0.3 |

**开正式环境前先定主体**：主体**选定后不能直接改**（个人 → 企业要公证 + 300 元 + 约 7 个工作日），所以先问清卖的是实物还是虚拟商品。卖实物 / 线下服务 → 必须企业或个体户，普通微信支付商户号不对个人主体开放；只卖虚拟商品且类目含「工具」→ 个人主体可以走虚拟支付（月限额 10 万）。不要因为「个人主体免费」就默认推荐它，也不要因为「个人开不了微信支付」就把虚拟商品需求也推去注册企业号。判据与路径见 [cloudbase-integration.md](cloudbase-integration.md) §0.1。

**开通路径**（细节见 [cloudbase-integration.md](cloudbase-integration.md) §0.2）：优先在开发者工具里点「云开发」按钮，登录页选择「微信公众平台登录」；腾讯云账号须已完成实名认证。

## 7. 通用建议

生成涉及 CloudBase 的小程序代码时：
1. 先读本陷阱文件。
2. 任何修改前先走 Change Safety Protocol。
3. 上传/发布流程须完成 Deployment Gate 检查清单。
4. 涉及消息推送 / 客服自动回复时，阅读 [message-push-customer-service.md](message-push-customer-service.md)。

这样可保持 skill 防御性，减少反复纠错循环。
