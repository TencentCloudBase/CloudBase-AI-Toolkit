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
              Add the CloudBase plugin marketplace and install the plugin via the Codex App graphical interface.
            </p>

            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepBody}>
                <strong>Open Plugin Directory</strong>
                <p>Click the <code>+</code> button in the top-right corner of Codex App.</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepBody}>
                <strong>Add Plugin Marketplace</strong>
                <p>Select <strong>Add Plugin Marketplace</strong> from the menu.</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepBody}>
                <strong>Fill in Marketplace Info</strong>
                <p>Enter the following information in the dialog:</p>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Source:</span>
                  <code className={styles.fieldValue}>TencentCloudBase/CloudBase-MCP</code>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Git Ref:</span>
                  <code className={styles.fieldValue}>main</code>
                </div>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Sparse Path:</span>
                  <span className={styles.fieldHint}>Leave empty</span>
                </div>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepBody}>
                <strong>Click Add Marketplace</strong>
                <p>Once added, find the <strong>Tencent CloudBase</strong> marketplace in the plugin list.</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>5</div>
              <div className={styles.stepBody}>
                <strong>Install CloudBase Plugin</strong>
                <p>Click the install button next to the <code>cloudbase</code> plugin.</p>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>6</div>
              <div className={styles.stepBody}>
                <strong>Start a New Thread to Verify</strong>
                <p>After installation, start a new Codex thread to let the plugin, skills, and MCP tools fully load.</p>
              </div>
            </div>

            <p className={styles.description}>
              After the plugin updates to a new version, remove and reinstall it once — refreshing the marketplace does not replace the copy that is already installed.
            </p>
          </div>
        </div>
      )}

      {/* Codex CLI Tab Content */}
      {activeTab === 'cli' && (
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <p className={styles.description}>
              If you prefer the command line, you can add the CloudBase plugin marketplace and install the plugin via Codex CLI.
            </p>

            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepBody}>
                <strong>Add Plugin Marketplace</strong>
                <p>Run the following command to add the CloudBase plugin marketplace:</p>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin marketplace add TencentCloudBase/CloudBase-MCP --ref main --sparse .agents/plugins --sparse plugin</code>
                </div>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepBody}>
                <strong>Install CloudBase Plugin</strong>
                <p>Install the CloudBase plugin:</p>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin add cloudbase@tencent-cloudbase</code>
                </div>
              </div>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepBody}>
                <strong>Start a New Thread to Verify</strong>
                <p>After installation, start a new Codex thread to let the plugin fully load. Verify with the following commands:</p>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin marketplace list</code>
                </div>
                <div className={styles.commandBlock}>
                  <code className={styles.commandText}>codex plugin list</code>
                </div>
              </div>
            </div>

            <p className={styles.description}>
              After the plugin updates to a new version, run <code>codex plugin remove cloudbase@tencent-cloudbase</code> and install it again — refreshing the marketplace does not replace the copy that is already installed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
