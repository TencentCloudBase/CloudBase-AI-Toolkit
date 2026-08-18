// tests/hooks/unified-ranker.test.mjs — Budget packing for complementary skills
import { describe, it, expect } from "vitest";
import { rerankPromptAnalysisReport } from "../../plugin/cloudbase/hooks/unified-ranker.mjs";

describe("rerankPromptAnalysisReport budget packing", () => {
  it("keeps miniprogram-development when injectionCost fits after two specialists", () => {
    const skillMap = {
      "ai-model-wechat": {
        description: "x".repeat(898),
        metadata: { priority: 5 },
      },
      "cloud-storage-web": {
        description: "x".repeat(149),
        metadata: { priority: 6 },
      },
      "miniprogram-development": {
        description: "x".repeat(1023),
        metadata: { priority: 8, injectionCost: 800 },
      },
    };
    const report = {
      results: [
        { skill: "ai-model-wechat", matched: true, score: 20, skill_metadata: skillMap["ai-model-wechat"] },
        { skill: "cloud-storage-web", matched: true, score: 16, skill_metadata: skillMap["cloud-storage-web"] },
        {
          skill: "miniprogram-development",
          matched: true,
          score: 16,
          skill_metadata: skillMap["miniprogram-development"],
        },
      ],
    };

    const reranked = rerankPromptAnalysisReport(report, skillMap, 3, 12000);

    expect(reranked.injectedSkills).toEqual([
      "ai-model-wechat",
      "miniprogram-development",
      "cloud-storage-web",
    ]);
    expect(reranked.droppedByBudget).toEqual([]);
  });

  it("still drops an oversized skill without injectionCost", () => {
    const skillMap = {
      "ai-model-wechat": {
        description: "x".repeat(898),
        metadata: { priority: 5 },
      },
      "miniprogram-development": {
        description: "x".repeat(1023),
        metadata: { priority: 8 },
      },
    };
    const report = {
      results: [
        { skill: "ai-model-wechat", matched: true, score: 20, skill_metadata: skillMap["ai-model-wechat"] },
        {
          skill: "miniprogram-development",
          matched: true,
          score: 16,
          skill_metadata: skillMap["miniprogram-development"],
        },
      ],
    };

    const reranked = rerankPromptAnalysisReport(report, skillMap, 3, 12000);

    expect(reranked.injectedSkills).toEqual(["ai-model-wechat"]);
    expect(reranked.droppedByBudget).toEqual(["miniprogram-development"]);
  });

  it("keeps web-development when injectionCost fits after two fullstack specialists", () => {
    const skillMap = {
      "cloud-functions": {
        description: "x".repeat(263),
        metadata: { priority: 8 },
      },
      "cloudbase-document-database-web-sdk": {
        description: "x".repeat(231),
        metadata: { priority: 7 },
      },
      "web-development": {
        description: "x".repeat(1023),
        metadata: { priority: 8, injectionCost: 800 },
      },
    };
    const report = {
      results: [
        { skill: "cloud-functions", matched: true, score: 20, skill_metadata: skillMap["cloud-functions"] },
        {
          skill: "cloudbase-document-database-web-sdk",
          matched: true,
          score: 16,
          skill_metadata: skillMap["cloudbase-document-database-web-sdk"],
        },
        { skill: "web-development", matched: true, score: 16, skill_metadata: skillMap["web-development"] },
      ],
    };

    const reranked = rerankPromptAnalysisReport(report, skillMap, 3, 12000);

    expect(reranked.injectedSkills).toEqual([
      "cloud-functions",
      "web-development",
      "cloudbase-document-database-web-sdk",
    ]);
    expect(reranked.droppedByBudget).toEqual([]);
  });

  it("drops long-description web-development without injectionCost in fullstack packing", () => {
    const skillMap = {
      "cloud-functions": {
        description: "x".repeat(263),
        metadata: { priority: 8 },
      },
      "web-development": {
        description: "x".repeat(1023),
        metadata: { priority: 8 },
      },
    };
    const report = {
      results: [
        { skill: "cloud-functions", matched: true, score: 20, skill_metadata: skillMap["cloud-functions"] },
        { skill: "web-development", matched: true, score: 16, skill_metadata: skillMap["web-development"] },
      ],
    };

    const reranked = rerankPromptAnalysisReport(report, skillMap, 3, 12000);

    expect(reranked.injectedSkills).toEqual(["cloud-functions"]);
    expect(reranked.droppedByBudget).toEqual(["web-development"]);
  });

  it("keeps cloudrun-development when injectionCost fits after two complementary skills", () => {
    const skillMap = {
      "ai-model-nodejs": {
        description: "x".repeat(805),
        metadata: { priority: 5 },
      },
      "cloud-storage-web": {
        description: "x".repeat(149),
        metadata: { priority: 6 },
      },
      "cloudrun-development": {
        description: "x".repeat(498),
        metadata: { priority: 7, injectionCost: 800 },
      },
    };
    const report = {
      results: [
        { skill: "ai-model-nodejs", matched: true, score: 20, skill_metadata: skillMap["ai-model-nodejs"] },
        { skill: "cloud-storage-web", matched: true, score: 16, skill_metadata: skillMap["cloud-storage-web"] },
        {
          skill: "cloudrun-development",
          matched: true,
          score: 16,
          skill_metadata: skillMap["cloudrun-development"],
        },
      ],
    };

    const reranked = rerankPromptAnalysisReport(report, skillMap, 3, 12000);

    expect(reranked.injectedSkills).toEqual([
      "ai-model-nodejs",
      "cloudrun-development",
      "cloud-storage-web",
    ]);
    expect(reranked.droppedByBudget).toEqual([]);
  });
});
