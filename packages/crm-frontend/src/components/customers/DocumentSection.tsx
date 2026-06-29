import { useState } from 'react';
import { Upload, FileText, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { documentService } from '@/services/documentService';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const DOC_TYPES = [
  'PAN_CARD','AADHAR_CARD','PASSPORT','DRIVING_LICENSE',
  'VOTER_ID','PHOTO','BANK_STATEMENT','SALARY_SLIP','OTHER',
];

export default function DocumentSection({ customerId, documents, onRefresh, canEdit }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ document_type: 'PAN_CARD', file_name: '', file_url: '', mime_type: '' });

  const handleAdd = async () => {
    if (!form.file_name || !form.file_url) {
      toast.error('File name and URL are required');
      return;
    }
    setSaving(true);
    try {
      await documentService.add({ ...form, customer_id: customerId });
      toast.success('Document added');
      setForm({ document_type: 'PAN_CARD', file_name: '', file_url: '', mime_type: '' });
      setAdding(false);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add document');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove document "${name}"?`)) return;
    try {
      await documentService.delete(id);
      toast.success('Document removed');
      onRefresh();
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Documents</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAdding(v => !v)} className="gap-2">
            <Upload className="h-3.5 w-3.5" />
            {adding ? 'Cancel' : 'Add Document'}
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Document Type</label>
              <Select value={form.document_type} onValueChange={v => setForm(f => ({ ...f, document_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_',' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">File Name</label>
              <Input
                value={form.file_name}
                onChange={e => setForm(f => ({ ...f, file_name: e.target.value }))}
                placeholder="aadhar_front.pdf"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">File URL</label>
              <Input
                value={form.file_url}
                onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))}
                placeholder="https://storage.example.com/docs/..."
              />
            </div>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saving} className="gap-2">
            {saving ? 'Saving…' : 'Save Document'}
          </Button>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground py-8 rounded-xl border border-dashed border-border">
          <FileText className="h-8 w-8 opacity-30" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {doc.document_type.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {doc.uploader?.full_name}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-500"
                    onClick={() => handleDelete(doc.id, doc.file_name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
