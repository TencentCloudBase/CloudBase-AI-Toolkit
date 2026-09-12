/** zh 词典聚合器：key 真源。MessageKey 由该树推导，模块文件见 locales/modules/ */
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

export const zh = {
  env: env.zh,
  storage: storage.zh,
  storagePG: storagePG.zh,
  hosting: hosting.zh,
  functions: functions.zh,
  deploy: deploy.zh,
  functionDeploy: functionDeploy.zh,
  functionDeploySchema: functionDeploySchema.zh,
  functionDeployProgress: functionDeployProgress.zh,
  functionUpdating: functionUpdating.zh,
  databaseSQL: databaseSQL.zh,
  databasePG: databasePG.zh,
  databaseNoSQL: databaseNoSQL.zh,
  dataModel: dataModel.zh,
  cloudrun: cloudrun.zh,
  cloudrunConfig: cloudrunConfig.zh,
  gateway: gateway.zh,
  capi: capi.zh,
  apps: apps.zh,
  appAuth: appAuth.zh,
  permissions: permissions.zh,
  rag: rag.zh,
  logs: logs.zh,
  agents: agents.zh,
  msgPush: msgPush.zh,
  setup: setup.zh,
  envSetup: envSetup.zh,
  interactive: interactive.zh,
};

export type Messages = typeof zh;

type Join<K extends string, P> = P extends string ? `${K}.${P}` : never;
export type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];
export type MessageKey = Paths<Messages>;
