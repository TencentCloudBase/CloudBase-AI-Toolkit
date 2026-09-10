/** en 词典聚合器：与 zh 树同构，key 完整性由各模块 defineModule 泛型编译期保证 */
import { env } from "./modules/env.js";
import { storage } from "./modules/storage.js";
import { storagePG } from "./modules/storagePG.js";
import { hosting } from "./modules/hosting.js";
import { functions } from "./modules/functions.js";
import { deploy } from "./modules/deploy.js";
import { functionDeploy } from "./modules/functionDeploy.js";
import { functionDeploySchema } from "./modules/functionDeploySchema.js";
import { functionDeployProgress } from "./modules/functionDeployProgress.js";
import { functionUpdating } from "./modules/functionUpdating.js";
import { databaseSQL } from "./modules/databaseSQL.js";
import { databasePG } from "./modules/databasePG.js";
import { databaseNoSQL } from "./modules/databaseNoSQL.js";
import { dataModel } from "./modules/dataModel.js";
import { cloudrun } from "./modules/cloudrun.js";
import { cloudrunConfig } from "./modules/cloudrunConfig.js";
import { gateway } from "./modules/gateway.js";
import { capi } from "./modules/capi.js";
import { apps } from "./modules/apps.js";
import { appAuth } from "./modules/appAuth.js";
import { permissions } from "./modules/permissions.js";
import { rag } from "./modules/rag.js";
import { logs } from "./modules/logs.js";
import { agents } from "./modules/agents.js";
import { msgPush } from "./modules/msgPush.js";
import { setup } from "./modules/setup.js";
import { envSetup } from "./modules/envSetup.js";
import { interactive } from "./modules/interactive.js";

export const en = {
  env: env.en,
  storage: storage.en,
  storagePG: storagePG.en,
  hosting: hosting.en,
  functions: functions.en,
  deploy: deploy.en,
  functionDeploy: functionDeploy.en,
  functionDeploySchema: functionDeploySchema.en,
  functionDeployProgress: functionDeployProgress.en,
  functionUpdating: functionUpdating.en,
  databaseSQL: databaseSQL.en,
  databasePG: databasePG.en,
  databaseNoSQL: databaseNoSQL.en,
  dataModel: dataModel.en,
  cloudrun: cloudrun.en,
  cloudrunConfig: cloudrunConfig.en,
  gateway: gateway.en,
  capi: capi.en,
  apps: apps.en,
  appAuth: appAuth.en,
  permissions: permissions.en,
  rag: rag.en,
  logs: logs.en,
  agents: agents.en,
  msgPush: msgPush.en,
  setup: setup.en,
  envSetup: envSetup.en,
  interactive: interactive.en,
};
