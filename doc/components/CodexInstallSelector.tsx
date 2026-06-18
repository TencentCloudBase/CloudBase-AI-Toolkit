import React, { useState } from 'react';
import styles from './CodexInstallSelector.module.css';

interface Tab {
  id: string;
  label: string;
}

const TABS: Tab[] = [
  { id: 'app', label: 'Codex App' },
  { id: 'cli', label: 'Codex CLI' },
];

export default function CodexInstallSelector() {
  const [activeTab, setActiveTab] = useState('app');

  return (
    <div className={styles.container}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Codex App Tab Content */}
      {activeTab === 'app' && (
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <p className={styles.description}>
              通过 Codex App 的图形界面添加 CloudBase 插件市场并安装插件。
            </p>

            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepBody}>
                <strong>打开插件目录</strong>
                <p>在 Codex App 中点击右上角的 <code>+</code> 按钮。</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepBody}>
                <strong>添加插件市场</strong>
                <p>在菜单中选择 <strong>添加插件市场</strong>。</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepBody}>
                <strong>填写市场信息</strong>
                <p>在弹窗中填写以下信息：</p>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>来源：</span>
                  <code className={styles.fieldValue}>TencentCloudBase/CloudBase-MCP</code>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Git 引用：</span>
                  <code className={styles.fieldValue}>main</code>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>稀疏路径：</span>
                  <span className={styles.fieldHint}>留空</span>
                </div>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepBody}>
                <strong>点击添加市场</strong>
                <p>添加成功后，在插件列表中找到 <strong>Tencent CloudBase</strong> 市场。</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>5</div>
              <div className={styles.stepBody}>
                <strong>安装 CloudBase 插件</strong>
                <p>点击 <code>cloudbase</code> 插件旁的安装按钮。</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>6</div>
              <div className={styles.stepBody}>
                <strong>新开线程验证</strong>
                <p>安装后建议新开一个 Codex 线程，让插件、技能和 MCP 工具完整加载。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Codex CLI Tab Content */}
      {activeTab === 'cli' && (
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <p className={styles.description}>
              如果你更习惯使用命令行，可以通过 Codex CLI 添加插件市场并安装插件。
            </p>

            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepBody}>
                <strong>添加插件市场</strong>
                <p>运行以下命令添加 CloudBase 插件市场：</p>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin marketplace add TencentCloudBase/CloudBase-MCP --ref main</code>
                </div>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepBody}>
                <strong>安装 CloudBase 插件</strong>
                <p>安装 CloudBase 插件：</p>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin add cloudbase@tencent-cloudbase</code>
                </div>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepBody}>
                <strong>新开线程验证</strong>
                <p>安装后建议新开一个 Codex 线程，让插件完整加载。可用以下命令验证：</p>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin marketplace list</code>
                </div>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin list</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
