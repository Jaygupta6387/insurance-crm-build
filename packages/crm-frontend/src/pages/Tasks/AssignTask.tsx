import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CreateTaskRequest } from '@/services/taskService';
// import { ROUTES } from '../../utils/constants';
// import { CustomerAutocomplete } from '../../components/Forms/CustomerAutocomplete';
// import { LoadingSpinner } from '../../components/Common/LoadingSpinner';
import { FileUpload } from '@/components/customers/FileUpload';

type FormData = CreateTaskRequest & {
  link_type?: 'customer' | 'lead' | 'policy' | 'none';
  customer_name?: string;
  lead_name?: string;
  policy_number?: string;
};

export const AssignTask: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      task_type: 'follow-up',
      priority: 'medium',
      link_type: 'none',
    },
  });

  const linkType = watch('link_type');

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // API call will go here
      console.log('Creating task:', data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSuccess(true);
      
      // Redirect after success
      setTimeout(() => {
        // navigate(ROUTES.TASKS);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Create New Task</h1>
              <p className="text-primary-100 mt-1">Assign a task to your team member</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 rounded-lg shadow-md flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Task created successfully! Redirecting...</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Task Details */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
              <div className="bg-blue-100 rounded-lg p-2">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Task Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Title */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Task Title *</label>
                <input
                  {...register('title', { required: 'Task title is required' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="e.g., Follow up with customer for policy renewal"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                )}
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                <textarea
                  {...register('description', { required: 'Description is required' })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="Provide detailed information about this task..."
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                )}
              </div>

              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Task Type *</label>
                <select
                  {...register('task_type', { required: 'Task type is required' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="follow-up">Follow-up</option>
                  <option value="documentation">Documentation</option>
                  <option value="claim">Claim Processing</option>
                  <option value="renewal">Renewal</option>
                  <option value="customer-service">Customer Service</option>
                  <option value="sales">Sales</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority *</label>
                <select
                  {...register('priority', { required: 'Priority is required' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🟠 High</option>
                  <option value="urgent">🔴 Urgent</option>
                </select>
              </div>

              {/* Assign To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign To *</label>
                <select
                  {...register('assigned_to', { required: 'Please select an employee' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="">Select Employee</option>
                  <option value="emp_001">John Doe</option>
                  <option value="emp_002">Jane Smith</option>
                  <option value="emp_003">Mike Johnson</option>
                  <option value="emp_004">Sarah Williams</option>
                </select>
                {errors.assigned_to && (
                  <p className="mt-1 text-sm text-red-600">{errors.assigned_to.message}</p>
                )}
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
                <input
                  type="date"
                  {...register('due_date', { required: 'Due date is required' })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
                {errors.due_date && (
                  <p className="mt-1 text-sm text-red-600">{errors.due_date.message}</p>
                )}
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
                <textarea
                  {...register('notes')}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="Any additional information or instructions..."
                />
              </div>
            </div>
          </div>

          {/* Link to Customer/Lead/Policy */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
              <div className="bg-purple-100 rounded-lg p-2">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Link to Related Data</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Link Type</label>
              <select
                {...register('link_type')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="none">None</option>
                <option value="customer">Link to Customer</option>
                <option value="lead">Link to Lead</option>
                <option value="policy">Link to Policy</option>
              </select>
            </div>

            {linkType === 'customer' && (
              <div>
                {/* <CustomerAutocomplete
                  value={watch('customer_id')}
                  onChange={(customerId, customer) => {
                    setValue('customer_id', customerId || '');
                    setValue('customer_name', customer?.customer_name || '');
                  }}
                  onInputChange={() => {}}
                /> */}
              </div>
            )}

            {linkType === 'lead' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Lead</label>
                <select
                  {...register('lead_id')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="">Select a lead</option>
                  <option value="lead_001">Tech Solutions Pvt Ltd - SME Insurance</option>
                  <option value="lead_002">Startup Inc - Health Insurance</option>
                  <option value="lead_003">ABC Corp - Motor Insurance</option>
                </select>
              </div>
            )}

            {linkType === 'policy' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Policy</label>
                <select
                  {...register('policy_id')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="">Select a policy</option>
                  <option value="pol_001">POL2024001 - Rajesh Sharma - Health</option>
                  <option value="pol_002">POL2024002 - Priya Verma - Motor</option>
                  <option value="pol_003">POL2024003 - Amit Kumar - Life</option>
                </select>
              </div>
            )}
          </div>

          {/* Attachments Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
              <div className="bg-green-100 rounded-lg p-2">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Attachments</h2>
            </div>

            <div className="space-y-4">
              <FileUpload
                label="Task Documents"
                name="task_document_1"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                maxSize={10}
                value={watch('task_document_1' as any) as File | null}
                onChange={(file) => setValue('task_document_1' as any, file as any)}
              />

              <FileUpload
                label="Additional Document"
                name="task_document_2"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                maxSize={10}
                value={watch('task_document_2' as any) as File | null}
                onChange={(file) => setValue('task_document_2' as any, file as any)}
              />

              <FileUpload
                label="Supporting Files"
                name="task_document_3"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                maxSize={10}
                value={watch('task_document_3' as any) as File | null}
                onChange={(file) => setValue('task_document_3' as any, file as any)}
              />

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Attachment Guidelines</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                      <li>Maximum file size: 10 MB per document</li>
                      <li>Supported formats: PDF, Images (JPG, PNG), Word, Excel</li>
                      <li>You can attach up to 3 documents per task</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-100">
            <div className="flex flex-col sm:flex-row justify-end gap-4">
              <button
                type="button"
                // onClick={() => navigate(ROUTES.TASKS)}
                className="px-6 py-3 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl font-semibold hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    {/* <LoadingSpinner size="sm" /> */}
                    <span>Creating Task...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Create Task</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

