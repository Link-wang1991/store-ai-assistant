// ============================================================
// 数据访问适配层（lib/db）— 仅后端模式
// ============================================================

import { db as backendDb } from "./backend-impl";

export const db = backendDb;

export type Db = typeof db;
