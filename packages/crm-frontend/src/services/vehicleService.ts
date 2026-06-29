import api from '@/lib/axios';

export interface VehicleRef {
  id: string;
  rto_code?: string;
  rto_name?: string;
  city?: string;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  registration_number: string;
  is_new_registration: boolean;
  rto_code_id?: string | null;
  rto_code?: { id: string; rto_code: string; rto_name: string; city: string } | null;
  chassis_last6?: string | null;
  make_id?: string | null;
  make?: { id: string; make_name: string } | null;
  model_id?: string | null;
  model?: { id: string; model_name: string } | null;
  variant_id?: string | null;
  variant?: { id: string; variant_name: string } | null;
  manufacture_year?: number | null;
  registration_date?: string | null;
  fuel_type?: string | null;
  cubic_capacity?: number | null;
  battery_capacity?: string | null;
  seating_capacity?: number | null;
  active_policy?: { id: string; policy_number: string | null; status: string } | null;
  has_active_policy?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type VehiclePayload = Partial<Omit<Vehicle, 'id' | 'rto_code' | 'make' | 'model' | 'variant'>> & {
  customer_id: string;
};

export const vehicleService = {
  listByCustomer: (customerId: string) => api.get(`/vehicles/customer/${customerId}`),
  get: (id: string) => api.get(`/vehicles/${id}`),
  create: (data: VehiclePayload) => api.post('/vehicles', data),
  update: (id: string, data: Partial<VehiclePayload>) => api.put(`/vehicles/${id}`, data),
  delete: (id: string) => api.delete(`/vehicles/${id}`),
  rtoLookup: (registration: string) => api.get('/vehicles/rto-lookup', { params: { registration } }),
};

export default vehicleService;
