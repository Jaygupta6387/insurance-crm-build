import api from '@/lib/axios';

// Motor Masters Service
export const motorMastersService = {
  // Motor Makes
  getMotorMakes: (params = {}) =>
    api.get('/motor-masters/motor-makes', { params }),
  createMotorMake: (data) =>
    api.post('/motor-masters/motor-makes', data),
  updateMotorMake: (id, data) =>
    api.put(`/motor-masters/motor-makes/${id}`, data),
  deleteMotorMake: (id) =>
    api.delete(`/motor-masters/motor-makes/${id}`),

  // Motor Models
  getMotorModels: (params = {}) =>
    api.get('/motor-masters/motor-models', { params }),
  createMotorModel: (data) =>
    api.post('/motor-masters/motor-models', data),
  updateMotorModel: (id, data) =>
    api.put(`/motor-masters/motor-models/${id}`, data),
  deleteMotorModel: (id) =>
    api.delete(`/motor-masters/motor-models/${id}`),

  // Motor Variants
  getMotorVariants: (params = {}) =>
    api.get('/motor-masters/motor-variants', { params }),
  createMotorVariant: (data) =>
    api.post('/motor-masters/motor-variants', data),
  updateMotorVariant: (id, data) =>
    api.put(`/motor-masters/motor-variants/${id}`, data),
  deleteMotorVariant: (id) =>
    api.delete(`/motor-masters/motor-variants/${id}`),

  // RTO Codes
  getRtoCodes: (params = {}) =>
    api.get('/motor-masters/rto-codes', { params }),
  createRtoCode: (data) =>
    api.post('/motor-masters/rto-codes', data),
  updateRtoCode: (id, data) =>
    api.put(`/motor-masters/rto-codes/${id}`, data),
  deleteRtoCode: (id) =>
    api.delete(`/motor-masters/rto-codes/${id}`),

  // Add-On Coverages
  getAddOnCoverages: (params = {}) =>
    api.get('/motor-masters/add-on-coverages', { params }),
  createAddOnCoverage: (data) =>
    api.post('/motor-masters/add-on-coverages', data),
  updateAddOnCoverage: (id, data) =>
    api.put(`/motor-masters/add-on-coverages/${id}`, data),
  deleteAddOnCoverage: (id) =>
    api.delete(`/motor-masters/add-on-coverages/${id}`),
};

// Types
export interface MotorMake {
  id: string;
  make_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MotorModel {
  id: string;
  make_id: string;
  model_name: string;
  is_active: boolean;
  make?: { id: string; make_name: string };
  created_at: string;
  updated_at: string;
}

export interface MotorVariant {
  id: string;
  make_id: string;
  model_id: string;
  variant_name: string;
  is_active: boolean;
  make?: { id: string; make_name: string };
  model?: { id: string; model_name: string };
  created_at: string;
  updated_at: string;
}

export interface RtoCode {
  id: string;
  rto_code: string;
  rto_name: string;
  city: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddOnCoverage {
  id: string;
  add_on_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export default motorMastersService;
