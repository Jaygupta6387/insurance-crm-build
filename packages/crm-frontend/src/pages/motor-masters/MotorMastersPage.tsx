import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motorMastersService, MotorMake, MotorModel, MotorVariant, RtoCode, AddOnCoverage } from '@/services/motorMastersService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Plus, Edit2, Trash2, Search, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { motion } from 'framer-motion';

type Tab = 'makes' | 'models' | 'variants' | 'rto-codes' | 'add-ons';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function MotorMastersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('makes');
  const [motorMakes, setMotorMakes] = useState<MotorMake[]>([]);
  const [motorModels, setMotorModels] = useState<MotorModel[]>([]);
  const [motorVariants, setMotorVariants] = useState<MotorVariant[]>([]);
  const [rtoCodes, setRtoCodes] = useState<RtoCode[]>([]);
  const [addOnCoverages, setAddOnCoverages] = useState<AddOnCoverage[]>([]);

  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0, pages: 0 });
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  const { user } = useAuthStore();
  const toastApi = useToast();
  const toast = ({ title, description, variant }: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => {
    if (variant === 'destructive') {
      toastApi.error(title || 'Error', description);
      return;
    }
    toastApi.success(title || 'Success', description);
  };
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = user?.permissions?.can_edit_motor_masters || isAdmin;
  const canCreate = user?.permissions?.can_create_motor_masters || canEdit || isAdmin;
  const canDelete = user?.permissions?.can_delete_motor_masters || isAdmin;
  const canView = user?.permissions?.can_view_motor_masters || isAdmin;

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-8 text-center">
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="text-sm text-muted-foreground mt-2">You don't have permission to view motor masters.</p>
        </Card>
      </div>
    );
  }

  // Fetch data based on active tab
  const fetchData = async () => {
    try {
      setLoading(true);
      const params = { page: pagination.page, limit: pagination.limit, search, ...(filterActive !== null && { is_active: filterActive }) };

      if (activeTab === 'makes') {
        const res = await motorMastersService.getMotorMakes(params);
        setMotorMakes(res.data?.data?.data || []);
        setPagination(res.data?.data?.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
      } else if (activeTab === 'models') {
        const res = await motorMastersService.getMotorModels(params);
        setMotorModels(res.data?.data?.data || []);
        setPagination(res.data?.data?.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
      } else if (activeTab === 'variants') {
        const res = await motorMastersService.getMotorVariants(params);
        setMotorVariants(res.data?.data?.data || []);
        setPagination(res.data?.data?.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
      } else if (activeTab === 'rto-codes') {
        const res = await motorMastersService.getRtoCodes(params);
        setRtoCodes(res.data?.data?.data || []);
        setPagination(res.data?.data?.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
      } else if (activeTab === 'add-ons') {
        const res = await motorMastersService.getAddOnCoverages(params);
        setAddOnCoverages(res.data?.data?.data || []);
        setPagination(res.data?.data?.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.message || 'Failed to fetch data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPagination({ ...pagination, page: 1 });
  }, [activeTab, search, filterActive]);

  useEffect(() => {
    fetchData();
  }, [activeTab, pagination.page, search, filterActive]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({});
    setShowDialog(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({ ...item });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    try {
      if (!formData.make_name && activeTab === 'makes') {
        toast({ title: 'Validation Error', description: 'Make name is required', variant: 'destructive' });
        return;
      }
      if (!formData.model_name && activeTab === 'models') {
        toast({ title: 'Validation Error', description: 'Model name is required', variant: 'destructive' });
        return;
      }
      if (!formData.make_id && activeTab === 'models') {
        toast({ title: 'Validation Error', description: 'Make is required', variant: 'destructive' });
        return;
      }
      if (!formData.variant_name && activeTab === 'variants') {
        toast({ title: 'Validation Error', description: 'Variant name is required', variant: 'destructive' });
        return;
      }
      if (!formData.make_id && activeTab === 'variants') {
        toast({ title: 'Validation Error', description: 'Make is required', variant: 'destructive' });
        return;
      }
      if (!formData.model_id && activeTab === 'variants') {
        toast({ title: 'Validation Error', description: 'Model is required', variant: 'destructive' });
        return;
      }
      if (!formData.rto_code && activeTab === 'rto-codes') {
        toast({ title: 'Validation Error', description: 'RTO Code is required', variant: 'destructive' });
        return;
      }
      if (!formData.rto_name && activeTab === 'rto-codes') {
        toast({ title: 'Validation Error', description: 'RTO Name is required', variant: 'destructive' });
        return;
      }
      if (!formData.city && activeTab === 'rto-codes') {
        toast({ title: 'Validation Error', description: 'City is required', variant: 'destructive' });
        return;
      }
      if (!formData.add_on_name && activeTab === 'add-ons') {
        toast({ title: 'Validation Error', description: 'Coverage name is required', variant: 'destructive' });
        return;
      }

      setSubmitting(true);

      if (activeTab === 'makes') {
        const data = { make_name: formData.make_name, is_active: formData.is_active ?? true };
        if (editingId) await motorMastersService.updateMotorMake(editingId, data);
        else await motorMastersService.createMotorMake(data);
        toast({ title: 'Success', description: `Motor make ${editingId ? 'updated' : 'created'} successfully` });
      } else if (activeTab === 'models') {
        const data = { make_id: formData.make_id, model_name: formData.model_name, is_active: formData.is_active ?? true };
        if (editingId) await motorMastersService.updateMotorModel(editingId, data);
        else await motorMastersService.createMotorModel(data);
        toast({ title: 'Success', description: `Motor model ${editingId ? 'updated' : 'created'} successfully` });
      } else if (activeTab === 'variants') {
        const data = { make_id: formData.make_id, model_id: formData.model_id, variant_name: formData.variant_name, is_active: formData.is_active ?? true };
        if (editingId) await motorMastersService.updateMotorVariant(editingId, data);
        else await motorMastersService.createMotorVariant(data);
        toast({ title: 'Success', description: `Motor variant ${editingId ? 'updated' : 'created'} successfully` });
      } else if (activeTab === 'rto-codes') {
        const data = { rto_code: formData.rto_code, rto_name: formData.rto_name, city: formData.city, is_active: formData.is_active ?? true };
        if (editingId) await motorMastersService.updateRtoCode(editingId, data);
        else await motorMastersService.createRtoCode(data);
        toast({ title: 'Success', description: `RTO Code ${editingId ? 'updated' : 'created'} successfully` });
      } else if (activeTab === 'add-ons') {
        const data = { add_on_name: formData.add_on_name, is_active: formData.is_active ?? true };
        if (editingId) await motorMastersService.updateAddOnCoverage(editingId, data);
        else await motorMastersService.createAddOnCoverage(data);
        toast({ title: 'Success', description: `Add-on coverage ${editingId ? 'updated' : 'created'} successfully` });
      }

      setShowDialog(false);
      setFormData({});
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.message || 'Operation failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      if (activeTab === 'makes') await motorMastersService.deleteMotorMake(deleteId);
      else if (activeTab === 'models') await motorMastersService.deleteMotorModel(deleteId);
      else if (activeTab === 'variants') await motorMastersService.deleteMotorVariant(deleteId);
      else if (activeTab === 'rto-codes') await motorMastersService.deleteRtoCode(deleteId);
      else if (activeTab === 'add-ons') await motorMastersService.deleteAddOnCoverage(deleteId);

      toast({ title: 'Success', description: 'Item deleted successfully' });
      setDeleteId(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.response?.data?.message || 'Failed to delete', variant: 'destructive' });
    }
  };

  const renderTable = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (activeTab === 'makes') return renderMakesTable();
    if (activeTab === 'models') return renderModelsTable();
    if (activeTab === 'variants') return renderVariantsTable();
    if (activeTab === 'rto-codes') return renderRtoCodesTable();
    if (activeTab === 'add-ons') return renderAddOnsTable();
  };

  const renderMakesTable = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {motorMakes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No motor makes found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-semibold">#</th>
                <th className="p-3 text-left font-semibold">Make Name</th>
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3 text-left font-semibold">Created</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {motorMakes.map((make, idx) => (
                <tr key={make.id} className="border-b hover:bg-muted/30 transition">
                  <td className="p-3">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="p-3 font-medium">{make.make_name}</td>
                  <td className="p-3">
                    <Badge variant={make.is_active ? 'default' : 'secondary'}>{make.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(make.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right space-x-2">
                    {(canEdit || isAdmin) && <Button size="sm" variant="outline" onClick={() => handleOpenEdit(make)}><Edit2 className="h-3 w-3" /></Button>}
                    {(canDelete || isAdmin) && <Button size="sm" variant="destructive" onClick={() => setDeleteId(make.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );

  const renderModelsTable = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {motorModels.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No motor models found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-semibold">#</th>
                <th className="p-3 text-left font-semibold">Make</th>
                <th className="p-3 text-left font-semibold">Model Name</th>
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3 text-left font-semibold">Created</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {motorModels.map((model, idx) => (
                <tr key={model.id} className="border-b hover:bg-muted/30 transition">
                  <td className="p-3">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="p-3 font-medium">{model.make?.make_name || '-'}</td>
                  <td className="p-3 font-medium">{model.model_name}</td>
                  <td className="p-3">
                    <Badge variant={model.is_active ? 'default' : 'secondary'}>{model.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(model.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right space-x-2">
                    {(canEdit || isAdmin) && <Button size="sm" variant="outline" onClick={() => handleOpenEdit(model)}><Edit2 className="h-3 w-3" /></Button>}
                    {(canDelete || isAdmin) && <Button size="sm" variant="destructive" onClick={() => setDeleteId(model.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );

  const renderVariantsTable = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {motorVariants.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No motor variants found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-semibold">#</th>
                <th className="p-3 text-left font-semibold">Make</th>
                <th className="p-3 text-left font-semibold">Model</th>
                <th className="p-3 text-left font-semibold">Variant Name</th>
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3 text-left font-semibold">Created</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {motorVariants.map((variant, idx) => (
                <tr key={variant.id} className="border-b hover:bg-muted/30 transition">
                  <td className="p-3">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="p-3 font-medium">{variant.make?.make_name || '-'}</td>
                  <td className="p-3 font-medium">{variant.model?.model_name || '-'}</td>
                  <td className="p-3 font-medium">{variant.variant_name}</td>
                  <td className="p-3">
                    <Badge variant={variant.is_active ? 'default' : 'secondary'}>{variant.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(variant.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right space-x-2">
                    {(canEdit || isAdmin) && <Button size="sm" variant="outline" onClick={() => handleOpenEdit(variant)}><Edit2 className="h-3 w-3" /></Button>}
                    {(canDelete || isAdmin) && <Button size="sm" variant="destructive" onClick={() => setDeleteId(variant.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );

  const renderRtoCodesTable = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {rtoCodes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No RTO codes found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-semibold">#</th>
                <th className="p-3 text-left font-semibold">RTO Code</th>
                <th className="p-3 text-left font-semibold">RTO Name</th>
                <th className="p-3 text-left font-semibold">City</th>
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3 text-left font-semibold">Created</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rtoCodes.map((rto, idx) => (
                <tr key={rto.id} className="border-b hover:bg-muted/30 transition">
                  <td className="p-3">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="p-3 font-mono font-semibold">{rto.rto_code}</td>
                  <td className="p-3 font-medium">{rto.rto_name}</td>
                  <td className="p-3">{rto.city}</td>
                  <td className="p-3">
                    <Badge variant={rto.is_active ? 'default' : 'secondary'}>{rto.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(rto.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right space-x-2">
                    {(canEdit || isAdmin) && <Button size="sm" variant="outline" onClick={() => handleOpenEdit(rto)}><Edit2 className="h-3 w-3" /></Button>}
                    {(canDelete || isAdmin) && <Button size="sm" variant="destructive" onClick={() => setDeleteId(rto.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );

  const renderAddOnsTable = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {addOnCoverages.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No add-on coverages found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-semibold">#</th>
                <th className="p-3 text-left font-semibold">Coverage Name</th>
                <th className="p-3 text-left font-semibold">Status</th>
                <th className="p-3 text-left font-semibold">Created</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {addOnCoverages.map((addon, idx) => (
                <tr key={addon.id} className="border-b hover:bg-muted/30 transition">
                  <td className="p-3">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
                  <td className="p-3 font-medium">{addon.add_on_name}</td>
                  <td className="p-3">
                    <Badge variant={addon.is_active ? 'default' : 'secondary'}>{addon.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(addon.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right space-x-2">
                    {(canEdit || isAdmin) && <Button size="sm" variant="outline" onClick={() => handleOpenEdit(addon)}><Edit2 className="h-3 w-3" /></Button>}
                    {(canDelete || isAdmin) && <Button size="sm" variant="destructive" onClick={() => setDeleteId(addon.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );

  const renderFormContent = () => {
    if (activeTab === 'makes') {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="make_name">Make Name *</Label>
            <Input id="make_name" placeholder="Enter make name" value={formData.make_name || ''} onChange={(e) => setFormData({ ...formData, make_name: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={formData.is_active ?? true} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
            <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
          </div>
        </>
      );
    }

    if (activeTab === 'models') {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="make_id_select">Make *</Label>
            <Select value={formData.make_id || ''} onValueChange={(val) => setFormData({ ...formData, make_id: val })}>
              <SelectTrigger id="make_id_select">
                <SelectValue placeholder="Select make" />
              </SelectTrigger>
              <SelectContent>
                {motorMakes.map((make) => (
                  <SelectItem key={make.id} value={make.id}>{make.make_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model_name">Model Name *</Label>
            <Input id="model_name" placeholder="Enter model name" value={formData.model_name || ''} onChange={(e) => setFormData({ ...formData, model_name: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active_m" checked={formData.is_active ?? true} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
            <Label htmlFor="is_active_m" className="cursor-pointer">Active</Label>
          </div>
        </>
      );
    }

    if (activeTab === 'variants') {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="make_id_v">Make *</Label>
            <Select value={formData.make_id || ''} onValueChange={(val) => {
              setFormData({ ...formData, make_id: val, model_id: '' }); // Reset model when make changes
            }}>
              <SelectTrigger id="make_id_v">
                <SelectValue placeholder="Select make" />
              </SelectTrigger>
              <SelectContent>
                {motorMakes.map((make) => (
                  <SelectItem key={make.id} value={make.id}>{make.make_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model_id_v">Model *</Label>
            <Select value={formData.model_id || ''} onValueChange={(val) => setFormData({ ...formData, model_id: val })}>
              <SelectTrigger id="model_id_v">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {motorModels.filter(m => m.make_id === formData.make_id).map((model) => (
                  <SelectItem key={model.id} value={model.id}>{model.model_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="variant_name">Variant Name *</Label>
            <Input id="variant_name" placeholder="Enter variant name" value={formData.variant_name || ''} onChange={(e) => setFormData({ ...formData, variant_name: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active_v" checked={formData.is_active ?? true} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
            <Label htmlFor="is_active_v" className="cursor-pointer">Active</Label>
          </div>
        </>
      );
    }

    if (activeTab === 'rto-codes') {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="rto_code">RTO Code *</Label>
            <Input id="rto_code" placeholder="Enter RTO code" value={formData.rto_code || ''} onChange={(e) => setFormData({ ...formData, rto_code: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rto_name">RTO Name *</Label>
            <Input id="rto_name" placeholder="Enter RTO name" value={formData.rto_name || ''} onChange={(e) => setFormData({ ...formData, rto_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input id="city" placeholder="Enter city" value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active_rto" checked={formData.is_active ?? true} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
            <Label htmlFor="is_active_rto" className="cursor-pointer">Active</Label>
          </div>
        </>
      );
    }

    if (activeTab === 'add-ons') {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor="add_on_name">Coverage Name *</Label>
            <Input id="add_on_name" placeholder="Enter coverage name" value={formData.add_on_name || ''} onChange={(e) => setFormData({ ...formData, add_on_name: e.target.value.toUpperCase() })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active_addon" checked={formData.is_active ?? true} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
            <Label htmlFor="is_active_addon" className="cursor-pointer">Active</Label>
          </div>
        </>
      );
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Motor Masters</h1>
          <p className="text-muted-foreground mt-1">Manage motor makes, models, variants, RTO codes, and add-on coverages</p>
        </div>
        {(canCreate || isAdmin) && (
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add New
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as Tab)} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="makes">Makes</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="variants">Variants</TabsTrigger>
          <TabsTrigger value="rto-codes">RTO Codes</TabsTrigger>
          <TabsTrigger value="add-ons">Add-Ons</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          <Card className="p-4">
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              {search && (
                <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>

          {renderTable()}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex justify-between items-center gap-2">
              <p className="text-sm text-muted-foreground">Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagination.page === 1} onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}>Previous</Button>
                <Button variant="outline" size="sm" disabled={pagination.page === pagination.pages} onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit' : 'Create'} {activeTab.replace('-', ' ')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">{renderFormContent()}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {deleteId && (
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this item? This action cannot be undone.</AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </motion.div>
  );
}
