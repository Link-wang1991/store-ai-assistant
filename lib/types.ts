export interface Store {
  id: string;
  name: string;
  brand_name: string | null;
  industry_type: string | null;
  address: string | null;
  owner_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface Employee {
  id: string;
  store_id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  role: string;
  position: string | null;
  status: string;
  joined_at: string | null;
  disabled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  store_id: string;
  title: string;
  category: string;
  file_url: string | null;
  file_type: string | null;
  visible_roles: string[];
  tags: string[];
  status: string;
  version: number;
  uploaded_by: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  store_id: string;
  document_id: string;
  title: string | null;
  content: string;
  category: string | null;
  visible_roles: string[];
  tags: string[];
  status: string;
  version: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  store_id: string;
  employee_id: string;
  role: string | null;
  user_message: string;
  ai_response: string | null;
  retrieved_chunks: unknown;
  question_category: string | null;
  risk_level: string | null;
  answer_type: string | null;
  needs_review: boolean;
  created_at: string;
}

export interface PendingQuestion {
  id: string;
  store_id: string;
  employee_id: string;
  question: string;
  ai_suggestion: string | null;
  category: string | null;
  risk_level: string | null;
  status: string;
  owner_reply: string | null;
  created_at: string;
}

export interface KnowledgeGap {
  id: string;
  store_id: string;
  employee_id: string | null;
  question: string;
  category: string | null;
  frequency: number;
  ai_temp_answer: string | null;
  status: string;
  created_at: string;
}

export interface RiskLog {
  id: string;
  store_id: string;
  employee_id: string | null;
  question: string;
  ai_response: string | null;
  risk_type: string | null;
  risk_level: string;
  status: string;
  handled_result: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  store_id: string;
  title: string;
  content: string | null;
  task_type: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  deadline: string | null;
  status: string;
  created_by: string | null;
  completed_at: string | null;
  feedback: string | null;
  owner_comment: string | null;
  created_at: string;
}

export interface BannedWord {
  id: string;
  store_id: string;
  word: string;
  reason: string | null;
  created_at: string;
}

export interface StandardAnswer {
  id: string;
  store_id: string;
  question: string;
  answer: string;
  category: string | null;
  visible_roles: string[];
  status: string;
  created_at: string;
}

// 当前登录上下文
export interface AuthContext {
  authUserId: string;
  user: AppUser;
  employee: Employee;
  store: Store;
  // 门店自定义角色名映射 role_key -> display_name（无配置则为空，回退到内置名）
  roleLabels: Record<string, string>;
  // 当前员工角色的基础模板（owner/manager/consultant/beautician/receptionist/operator）
  // 自定义角色通过 role_definitions.base_role 继承工作台与权限
  baseRole: string;
  // 当前角色的权限矩阵 module -> { actions, data_scope }
  permissions: Record<string, { actions: string[]; data_scope: string }>;
}
