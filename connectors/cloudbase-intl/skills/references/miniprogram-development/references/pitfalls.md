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

## 6. 通用建议

生成涉及 CloudBase 的小程序代码时：
1. 先读本陷阱文件。
2. 任何修改前先走 Change Safety Protocol。
3. 上传/发布流程须完成 Deployment Gate 检查清单。
4. 涉及消息推送 / 客服自动回复时，阅读 [message-push-customer-service.md](message-push-customer-service.md)。

这样可保持 skill 防御性，减少反复纠错循环。
