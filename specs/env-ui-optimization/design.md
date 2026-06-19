# 环境选择页面 UI 优化设计

## 设计目标

基于 UI 设计规范和用户反馈，优化 CloudBase 环境选择页面的交互体验。

## 改进内容

### 1. 页面布局优化

**Header 区域：**
- 左侧：Logo + 标题
- 右侧：账号信息 + 切换账号按钮 + GitHub 链接 + 帮助链接

**Content 区域：**
- 标题：简化为"选择 CloudBase 环境"
- 移除副标题"请选择您要使用的 CloudBase 环境"（冗余）
- 搜索框：添加环境搜索功能
- 环境列表：优化展示顺序（别名优先）
- 底部按钮：新建环境按钮常驻显示

### 2. 环境卡片优化

**调整前：**
```
[图标] 环境ID: cloud1-5g39elugeec5ba0f
       别名: cloud1 (个人版)
```

**调整后：**
```
[图标] cloud1 (个人版)
       cloud1-5g39elugeec5ba0f
```

**设计理念：**
- 别名（Alias）是用户自定义的友好名称，更易识别
- 环境ID作为次要信息，用灰色显示

### 3. 搜索功能

- 实时搜索，支持搜索别名和环境ID
- 搜索框带清除按钮
- 无搜索结果时显示提示信息

### 4. 右上角账号区域

**布局：**
```
[用户图标] UIN: 100010952056 | [切换图标] | [GitHub图标] | [帮助图标]
```

- 账号信息更紧凑
- 图标按钮统一样式
- 添加帮助文档和视频教程入口

### 5. 底部操作区域

**原设计：**
- 取消 | 确认选择（仅在选中环境时可用）
- 新建环境按钮仅在无环境时显示

**优化后：**
- 取消 | 确认选择
- 新建环境按钮常驻显示（独立于其他按钮）

### 6. 帮助链接

添加两个外部链接：
- 📚 帮助文档：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
- 🎬 视频教程：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials

## 设计规范遵循

根据 `ui-design.mdx`：

1. **配色方案：** 保持现有的黑色背景 + 青色强调色（符合规范）
2. **字体：** JetBrains Mono（专业等宽字体，符合规范）
3. **图标：** 使用 SVG 矢量图标（符合规范，避免 emoji）
4. **动画：** 保持现有的流畅过渡动画
5. **间距：** 使用合理的留白和间距

## 实现要点

### CSS 新增样式

```css
/* 搜索框样式 */
.search-box {
    margin-bottom: 20px;
    position: relative;
}

.search-input {
    width: 100%;
    padding: 12px 40px 12px 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-primary);
    font-size: 14px;
}

.search-clear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
}

/* 右上角账号区域 */
.header-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

.account-info-compact {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-secondary);
}

.btn-icon {
    padding: 8px;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
}

/* 环境卡片优化 */
.env-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
}

.env-id {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
}

/* 底部新建按钮 */
.footer-actions {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
}

.btn-create-fixed {
    width: 100%;
    padding: 14px;
    background: rgba(103, 233, 233, 0.1);
    border: 1px dashed var(--accent-color);
}
```

### JavaScript 新增功能

```javascript
// 搜索过滤功能
function filterEnvs(searchTerm) {
    const items = document.querySelectorAll('.env-item');
    let visibleCount = 0;
    
    items.forEach(item => {
        const name = item.querySelector('.env-name').textContent.toLowerCase();
        const id = item.querySelector('.env-id').textContent.toLowerCase();
        const match = name.includes(searchTerm.toLowerCase()) || 
                     id.includes(searchTerm.toLowerCase());
        
        item.style.display = match ? 'flex' : 'none';
        if (match) visibleCount++;
    });
    
    // 显示/隐藏无结果提示
    document.getElementById('noResults').style.display = 
        visibleCount === 0 ? 'block' : 'none';
}

// 清除搜索
function clearSearch() {
    document.getElementById('searchInput').value = '';
    filterEnvs('');
}
```

## 预期效果

1. **更直观：** 用户优先看到自己设置的别名
2. **更高效：** 通过搜索快速定位环境
3. **更便捷：** 账号切换和帮助入口更明显
4. **更完整：** 新建环境入口始终可见

## 下一步

1. 实现 HTML/CSS 改动
2. 添加 JavaScript 交互逻辑
3. 测试所有交互功能
4. 确保响应式兼容性








