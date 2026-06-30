import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { masterDataService, Product, SubProductType, InsuranceCompany, Lob } from '@/services/subBrokerService';
import { healthPlanService, type HealthPlan } from '@/services/healthPlanService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toaster';

type Tab = 'lobs' | 'products' | 'sub-products' | 'insurance' | 'health-plans';

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<Tab>('lobs');
  const [lobs, setLobs] = useState<Lob[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [subProducts, setSubProducts] = useState<SubProductType[]>([]);
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [healthPlans, setHealthPlans] = useState<HealthPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { user } = useAuthStore();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const loadHealthPlans = async () => {
    try {
      const res = await healthPlanService.listMaster();
      setHealthPlans(res.data?.data?.health_plans || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load health plans');
    }
  };

  // Fetch core master data — each request independent so one failure doesn't block LOBs
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [lobsRes, productsRes, subProductsRes, companiesRes] = await Promise.allSettled([
        masterDataService.getLobs(),
        masterDataService.getProducts(),
        masterDataService.getSubProducts(),
        masterDataService.getInsuranceCompanies(),
      ]);

      if (lobsRes.status === 'fulfilled') {
        setLobs(lobsRes.value.data?.data?.lobs || lobsRes.value.data?.lobs || []);
      } else {
        console.error(lobsRes.reason);
        toast.error('Failed to load LOBs');
      }

      if (productsRes.status === 'fulfilled') {
        setProducts(productsRes.value.data?.data?.products || productsRes.value.data?.products || []);
      } else {
        console.error(productsRes.reason);
        toast.error('Failed to load products');
      }

      if (subProductsRes.status === 'fulfilled') {
        setSubProducts(subProductsRes.value.data?.data?.sub_products || subProductsRes.value.data?.sub_products || []);
      } else {
        console.error(subProductsRes.reason);
        toast.error('Failed to load sub-products');
      }

      if (companiesRes.status === 'fulfilled') {
        setCompanies(companiesRes.value.data?.data?.insurance_companies || companiesRes.value.data?.insurance_companies || []);
      } else {
        console.error(companiesRes.reason);
        toast.error('Failed to load insurance companies');
      }

      setLoading(false);
    };
    fetchData();
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'health-plans') {
      loadHealthPlans();
    }
  }, [activeTab]);

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
      setSubmitting(true);
      if (activeTab === 'products') {
        const data = {
          lob_id: formData.lob_id || '',
          name: formData.name || '',
        };
        if (editingId) await masterDataService.updateProduct(editingId, data);
        else await masterDataService.createProduct(data);
        const res = await masterDataService.getProducts();
        setProducts(res.data?.data?.products || res.data?.products || []);
      } else if (activeTab === 'sub-products') {
        const data = {
          product_id: formData.product_id || '',
          name: formData.name || '',
        };
        if (editingId) await masterDataService.updateSubProduct(editingId, data);
        else await masterDataService.createSubProduct(data);
        const res = await masterDataService.getSubProducts();
        setSubProducts(res.data?.data?.sub_products || res.data?.sub_products || []);
      } else if (activeTab === 'insurance') {
        const data = {
          name: formData.name || '',
        };
        if (editingId) await masterDataService.updateInsuranceCompany(editingId, data);
        else await masterDataService.createInsuranceCompany(data);
        const res = await masterDataService.getInsuranceCompanies();
        setCompanies(res.data?.data?.insurance_companies || res.data?.insurance_companies || []);
      } else if (activeTab === 'health-plans') {
        const data = {
          name: formData.name || '',
          insurance_company_id: formData.insurance_company_id || undefined,
          is_active: formData.is_active !== false,
        };
        if (editingId) await healthPlanService.update(editingId, data);
        else await healthPlanService.create(data);
        await loadHealthPlans();
      }
      setShowDialog(false);
      setFormData({});
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setSubmitting(true);
      if (activeTab === 'products') {
        await masterDataService.deleteProduct(deleteId);
        setProducts((prev) => prev.filter((p) => p.id !== deleteId));
      } else if (activeTab === 'sub-products') {
        await masterDataService.deleteSubProduct(deleteId);
        setSubProducts((prev) => prev.filter((sp) => sp.id !== deleteId));
      } else if (activeTab === 'insurance') {
        await masterDataService.deleteInsuranceCompany(deleteId);
        setCompanies((prev) => prev.filter((c) => c.id !== deleteId));
      } else if (activeTab === 'health-plans') {
        await healthPlanService.delete(deleteId);
        setHealthPlans((prev) => prev.filter((p) => p.id !== deleteId));
      }
      setDeleteId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const tabsList: { id: Tab; label: string }[] = [
    { id: 'lobs', label: 'LOBs' },
    { id: 'products', label: 'Products' },
    { id: 'sub-products', label: 'Sub-Products' },
    { id: 'insurance', label: 'Insurance Companies' },
    { id: 'health-plans', label: 'Health Plans' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Master Data Management</h1>
          <p className="mt-2 text-gray-600">Manage products, sub-products, insurance companies, and lines of business</p>
        </div>

        {/* Tab buttons */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {tabsList.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab(tab.id);
                setEditingId(null);
                setFormData({});
              }}
              className="px-4 py-2"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab content */}
        <Card className="p-6">
          {activeTab === 'lobs' && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Lines of Business</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lobs.map((lob) => (
                      <tr key={lob.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{lob.name}</td>
                        <td className="px-4 py-2">
                          <Badge variant={lob.is_active ? 'default' : 'secondary'}>
                            {lob.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">{new Date(lob.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lobs.length === 0 && <p className="text-gray-600 text-center py-8">No LOBs available</p>}
            </div>
          )}

          {activeTab === 'products' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Products</h2>
                {isAdmin && (
                  <Button onClick={handleOpenCreate} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Product
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">LOB</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      {isAdmin && <th className="px-4 py-2 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{product.name}</td>
                        <td className="px-4 py-2">{product.lob?.name}</td>
                        <td className="px-4 py-2">
                          <Badge variant={product.is_active ? 'default' : 'secondary'}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(product)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteId(product.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {products.length === 0 && <p className="text-gray-600 text-center py-8">No products yet</p>}
            </div>
          )}

          {activeTab === 'sub-products' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Sub-Products</h2>
                {isAdmin && (
                  <Button onClick={handleOpenCreate} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Sub-Product
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      {isAdmin && <th className="px-4 py-2 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subProducts.map((sp) => (
                      <tr key={sp.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{sp.name}</td>
                        <td className="px-4 py-2">{sp.product?.name}</td>
                        <td className="px-4 py-2">
                          <Badge variant={sp.is_active ? 'default' : 'secondary'}>
                            {sp.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(sp)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteId(sp.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {subProducts.length === 0 && <p className="text-gray-600 text-center py-8">No sub-products yet</p>}
            </div>
          )}

          {activeTab === 'insurance' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Insurance Companies</h2>
                {isAdmin && (
                  <Button onClick={handleOpenCreate} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Company
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      {isAdmin && <th className="px-4 py-2 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((company) => (
                      <tr key={company.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{company.name}</td>
                        <td className="px-4 py-2">
                          <Badge variant={company.is_active ? 'default' : 'secondary'}>
                            {company.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(company)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteId(company.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {companies.length === 0 && <p className="text-gray-600 text-center py-8">No insurance companies yet</p>}
            </div>
          )}

          {activeTab === 'health-plans' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Health Plans</h2>
                {isAdmin && (
                  <Button onClick={handleOpenCreate} className="gap-2">
                    <Plus className="h-4 w-4" /> Add Health Plan
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left">Plan Name</th>
                      <th className="px-4 py-2 text-left">Insurer</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      {isAdmin && <th className="px-4 py-2 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {healthPlans.map((plan) => (
                      <tr key={plan.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">{plan.name}</td>
                        <td className="px-4 py-2">{plan.insurance_company?.name || '—'}</td>
                        <td className="px-4 py-2">
                          <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                            {plan.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(plan)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteId(plan.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {healthPlans.length === 0 && <p className="text-gray-600 text-center py-8">No health plans yet</p>}
            </div>
          )}
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? `Edit ${activeTab}` : `Create ${activeTab}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {activeTab === 'products' && (
                <>
                  <div>
                    <Label>LOB</Label>
                    <Select value={formData.lob_id || ''} onValueChange={(v) => setFormData({ ...formData, lob_id: v })}>
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900 dark:bg-white dark:text-gray-900">
                        <SelectValue placeholder="Select LOB" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-900">
                        {lobs.map((lob) => (
                          <SelectItem key={lob.id} value={lob.id}>
                            {lob.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                </>
              )}
              {activeTab === 'sub-products' && (
                <>
                  <div>
                    <Label>Product</Label>
                    <Select value={formData.product_id || ''} onValueChange={(v) => setFormData({ ...formData, product_id: v })}>
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900 dark:bg-white dark:text-gray-900">
                        <SelectValue placeholder="Select Product" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-900">
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                </>
              )}
              {activeTab === 'insurance' && (
                <div>
                  <Label>Name</Label>
                  <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
              )}
              {activeTab === 'health-plans' && (
                <>
                  <div>
                    <Label>Plan Name</Label>
                    <Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Insurance Company (optional)</Label>
                    <Select
                      value={formData.insurance_company_id || ''}
                      onValueChange={(v) => setFormData({ ...formData, insurance_company_id: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900 dark:bg-white dark:text-gray-900">
                        <SelectValue placeholder="Select insurer" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-900">
                        <SelectItem value="none">None</SelectItem>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="health-plan-active"
                      checked={formData.is_active !== false}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="health-plan-active">Active</Label>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        {deleteId && (
          <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Item?</DialogTitle>
              </DialogHeader>
              <p>Are you sure you want to delete this item? This action cannot be undone.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteId(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={handleDelete} disabled={submitting} className="bg-red-600 hover:bg-red-700">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
