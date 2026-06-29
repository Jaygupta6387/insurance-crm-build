import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Task,TaskStatus } from '@/services/taskService';
// import { ROUTES } from '../../utils/constants';
// import { useAuth } from '../../contexts/AuthContext';
// import { LoadingSpinner } from '../../components/Common/LoadingSpinner';

export const TaskDetails: React.FC = () => {
  const navigate = useNavigate();
  const { task_id } = useParams<{ task_id: string }>();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [newStatus, setNewStatus] = useState<TaskStatus>('pending');
  const [notes, setNotes] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // Mock data - Replace with API call later
  useEffect(() => {
    const mockTask: Task = {
      task_id: task_id || '1',
      title: 'Follow up with customer for policy renewal',
      description: 'Contact Mr. Sharma regarding his health policy renewal due next month. Need to discuss new premium rates and coverage options.',
      task_type: 'follow-up',
      priority: 'high',
      status: 'pending',
      assigned_to: 'emp_001',
      assigned_to_name: 'John Doe',
      assigned_by: 'admin_001',
      assigned_by_name: 'Admin User',
      due_date: '2025-12-10',
      customer_id: 'cust_001',
      customer_name: 'Rajesh Sharma',
      policy_id: 'pol_001',
      policy_number: 'POL2024001',
      notes: 'Customer prefers morning calls. Last contacted on Dec 1st.',
      created_at: '2025-12-01T10:00:00Z',
      updated_at: '2025-12-01T10:00:00Z',
    };
    
    setTimeout(() => {
      setTask(mockTask);
      setNewStatus(mockTask.status);
      setIsLoading(false);
    }, 500);
  }, [task_id]);

  const handleStatusChange = () => {
    if (!task) return;
    
    // API call will go here
    const updatedTask = {
      ...task,
      status: newStatus,
      completed_date: newStatus === 'completed' ? new Date().toISOString() : undefined,
      notes: notes || task.notes,
    };
    
    setTask(updatedTask);
    setShowStatusModal(false);
    setNotes('');
  };

  const handleReassign = () => {
    if (!task || !selectedEmployee) return;
    
    // API call will go here
    const updatedTask = {
      ...task,
      assigned_to: selectedEmployee,
      assigned_to_name: 'New Employee Name', // This would come from the selected employee
    };
    
    setTask(updatedTask);
    setShowReassignModal(false);
    setSelectedEmployee('');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        {/* <LoadingSpinner size="lg" /> */}
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Task not found</h3>
          <button
            // onClick={() => navigate(ROUTES.TASKS)}
            className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Tasks
          </button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const isOverdue = new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';
  const canModify = isAdmin || task.assigned_to === user?.id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl shadow-xl p-6 sm:p-8 text-white">
          <button
            // onClick={() => navigate(ROUTES.TASKS)}
            className="mb-4 text-primary-100 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Tasks
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold mb-2">{task.title}</h1>
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(task.status)}`}>
                  {task.status.toUpperCase().replace('-', ' ')}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPriorityColor(task.priority)}`}>
                  {task.priority.toUpperCase()}
                </span>
                {isOverdue && (
                  <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold border border-red-200">
                    OVERDUE
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {canModify && (
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-100">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowStatusModal(true)}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Update Status
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowReassignModal(true)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Reassign Task
                </button>
              )}
            </div>
          </div>
        )}

        {/* Task Details */}
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Task Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Task Type</label>
                <p className="text-gray-900 font-semibold capitalize">{task.task_type.replace('-', ' ')}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Due Date</label>
                <p className={`font-semibold ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {new Date(task.due_date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Assigned To</label>
                <p className="text-gray-900 font-semibold">{task.assigned_to_name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Assigned By</label>
                <p className="text-gray-900 font-semibold">{task.assigned_by_name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Created Date</label>
                <p className="text-gray-900">
                  {new Date(task.created_at).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>

              {task.completed_date && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Completed Date</label>
                  <p className="text-green-600 font-semibold">
                    {new Date(task.completed_date).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
            <p className="text-gray-700 leading-relaxed">{task.description}</p>
          </div>

          {task.notes && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Notes</h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-gray-700 leading-relaxed">{task.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Related Information */}
        {(task.customer_name || task.lead_name || task.policy_number) && (
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Related Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {task.customer_name && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 rounded-lg p-2">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Customer</p>
                      <p className="text-blue-900 font-semibold">{task.customer_name}</p>
                      <button
                        // onClick={() => navigate(`${ROUTES.CUSTOMERS}/${task.customer_id}`)}
                        className="text-sm text-blue-600 hover:text-blue-800 underline mt-1"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {task.lead_name && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 rounded-lg p-2">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-purple-600 font-medium">Lead</p>
                      <p className="text-purple-900 font-semibold">{task.lead_name}</p>
                      <button
                        // onClick={() => navigate(`${ROUTES.LEADS}/${task.lead_id}`)}
                        className="text-sm text-purple-600 hover:text-purple-800 underline mt-1"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {task.policy_number && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 rounded-lg p-2">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-green-600 font-medium">Policy</p>
                      <p className="text-green-900 font-semibold">{task.policy_number}</p>
                      <button
                        // onClick={() => navigate(`${ROUTES.POLICIES}/${task.policy_id}`)}
                        className="text-sm text-green-600 hover:text-green-800 underline mt-1"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Update Task Status</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Add any notes about this status update..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowStatusModal(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusChange}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Reassign Task</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Employee</label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select Employee</option>
                  <option value="emp_001">John Doe</option>
                  <option value="emp_002">Jane Smith</option>
                  <option value="emp_003">Mike Johnson</option>
                  <option value="emp_004">Sarah Williams</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowReassignModal(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={!selectedEmployee}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
