import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from '../server.js';

export function registerInviteCodeTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "activateInviteCode",
    {
      title: "激活邀请码",
      description: "云开发 AI编程激励计划，通过邀请码激活用户激励。",
      inputSchema: {
        InviteCode: z.string().describe("待激活的邀请码")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "invite-code"
      }
    },
    async ({ InviteCode }: { InviteCode: string }) => {
      if (!InviteCode) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ErrorCode: 'MissingParameter',
                ErrorMsg: '邀请码为必填项',
                RequestId: ''
              }, null, 2)
            }
          ]
        };
      }
      const manager = await getManager();
      const EnvId = await getEnvId(cloudBaseOptions);
      const result = await manager.commonService().call({
        Action: 'ActivateInviteCode',
        Param: { InviteCode, EnvId }
      });
      logCloudBaseResult(server.logger, result);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ErrorCode: result?.ErrorCode || '',
              ErrorMsg: result?.ErrorMsg || '',
              RequestId: result?.RequestId || ''
            }, null, 2)
          }
        ]
      };
    }
  );
} 