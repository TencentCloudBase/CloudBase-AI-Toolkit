import { z } from "zod";
import { t } from "../i18n/index.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { resolveSiteAndRegion, type SiteId } from "../utils/site-map.js";

/**
 * Returns the public new-issue page for this site and channel.
 * The tool does not submit an issue and does not accept a draft.
 */
export const FEEDBACK_TOOL_NAME = "prepareFeedback";

const CASE_TEMPLATE_FILE = "1-case-showcase.yml";
const RETROSPECTIVE_TEMPLATE_FILE = "2-dev-retrospective.yml";

export const FEEDBACK_ISSUE_NEW_URL: Record<SiteId, string> = {
  intl: "https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues/new",
  domestic: "https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-ToolKit/-/issues/new",
};

export type FeedbackChannel = "case" | "retrospective";

export function buildFeedbackTemplateUrl(site: SiteId, channel: FeedbackChannel): string {
  const base = FEEDBACK_ISSUE_NEW_URL[site];
  if (site === "intl") {
    const title = channel === "case" ? "[case]" : "[retrospective]";
    return `${base}?${new URLSearchParams({ title }).toString()}`;
  }
  const title = channel === "case" ? "[案例]" : "[复盘]";
  const template = channel === "case" ? CASE_TEMPLATE_FILE : RETROSPECTIVE_TEMPLATE_FILE;
  return `${base}?${new URLSearchParams({ template, title }).toString()}`;
}

export function registerFeedbackTools(server: ExtendedMcpServer): void {
  server.registerTool(
    FEEDBACK_TOOL_NAME,
    {
      title: "feedback.title",
      description: "feedback.description",
      inputSchema: {
        channel: z
          .enum(["case", "retrospective"])
          .describe("feedback.schema.channel"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        category: "feedback",
      },
    },
    async ({ channel }) => {
      const site = resolveSiteAndRegion({
        site: server.cloudBaseOptions?.site,
        region: server.cloudBaseOptions?.region,
      }).site;
      return jsonContent({
        success: true,
        channel,
        url: buildFeedbackTemplateUrl(site, channel),
        nextStep: t("feedback.nextStep"),
      });
    },
  );
}
