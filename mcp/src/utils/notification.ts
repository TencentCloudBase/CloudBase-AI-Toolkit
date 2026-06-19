import { ExtendedMcpServer } from '../server.js';
import { error, info } from './logger.js';

/**
 * Send deployment notification to CodeBuddy IDE
 * @param server ExtendedMcpServer instance
 * @param notificationData Deployment notification data
 */
export async function sendDeployNotification(
  server: ExtendedMcpServer,
  notificationData: {
    deployType: 'hosting' | 'cloudrun'; // Deployment type: hosting=static hosting, cloudrun=cloud run
    url: string;
    projectId: string;
    projectName: string;
    consoleUrl: string;
  }
): Promise<void> {
  // Check if current IDE is CodeBuddy (prefer server.ide, fallback to environment variable)
  const currentIde = server.ide || process.env.INTEGRATION_IDE;
  
  if (currentIde !== 'CodeBuddy' || !server.server) {
    // Not CodeBuddy IDE, skip notification
    return;
  }

  try {
    // Send notification using sendLoggingMessage
    server.server.sendLoggingMessage({
      level: "notice",
      data: {
        type: "tcb",
        event: "deploy",
        data: {
          type: notificationData.deployType, // "hosting" or "cloudrun"
          url: notificationData.url,
          projectId: notificationData.projectId,
          projectName: notificationData.projectName,
          consoleUrl: notificationData.consoleUrl
        }
      }
    });
    
    info(`CodeBuddy IDE: 已发送部署通知 - ${notificationData.deployType} - ${notificationData.url}`);
  } catch (err) {
    // Log error but don't throw - notification failure should not affect deployment flow
    error(`Failed to send deployment notification: ${err instanceof Error ? err.message : err}`, err instanceof Error ? err : new Error(String(err)));
  }
}

