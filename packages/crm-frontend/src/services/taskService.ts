export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskType = 'follow-up' | 'documentation' | 'claim' | 'renewal' | 'customer-service' | 'sales' | 'other';

export interface Task {
  task_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: string;
  assigned_to_name?: string;
  assigned_by: string;
  assigned_by_name?: string;
  due_date: string;
  completed_date?: string;
  customer_id?: string;
  customer_name?: string;
  lead_id?: string;
  lead_name?: string;
  policy_id?: string;
  policy_number?: string;
  notes?: string;
  attachments?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  task_type: TaskType;
  priority: TaskPriority;
  assigned_to: string;
  due_date: string;
  customer_id?: string;
  lead_id?: string;
  policy_id?: string;
  notes?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  task_type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigned_to?: string;
  due_date?: string;
  notes?: string;
  completed_date?: string;
}

