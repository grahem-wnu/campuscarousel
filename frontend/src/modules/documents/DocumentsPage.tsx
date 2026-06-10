import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, Card, EmptyState, Field, Select, Spinner, Textarea, useToast } from '../../shared/ui';
import { deleteDocument, getDocument, listDocuments, uploadDocument } from './api';
import { CATEGORY_LABELS, categoryLabel, formatBytes, validateFile } from './logic';
import type { DocumentCategory, DocumentMeta } from './types';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];

export default function DocumentsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DocumentCategory | ''>('');

  const [category, setCategory] = useState<DocumentCategory>('certificate');
  const [makePrivate, setMakePrivate] = useState(false);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await listDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Choose a file first.');
      return;
    }
    const problem = validateFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      await uploadDocument({ file, category, visibility: makePrivate ? 'private' : 'family', notes });
      toast.success(`Uploaded ${file.name}.`);
      if (fileRef.current) fileRef.current.value = '';
      setNotes('');
      setMakePrivate(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function download(id: string) {
    try {
      const detail = await getDocument(id);
      window.open(detail.downloadUrl, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the file.');
    }
  }

  async function remove(doc: DocumentMeta) {
    if (!window.confirm(`Delete ${doc.fileName}? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.documentId);
      toast.success('Deleted.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete.');
    }
  }

  const shown = filter ? docs.filter((d) => d.category === filter) : docs;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Documents</h1>
        <p className="text-sm text-ink-600">
          Keep certificates, essays, recommendation letters, and transcripts in one private place.
        </p>
      </header>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-800">Upload a file</h2>
        <input
          ref={fileRef}
          type="file"
          className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-700"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes (optional)">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {isStudent ? (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={makePrivate}
              onChange={(e) => setMakePrivate(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border text-primary-600"
            />
            Private (only you can see this)
          </label>
        ) : null}
        <div className="flex justify-end">
          <Button loading={uploading} onClick={() => void upload()}>
            Upload
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-800">Your documents</h2>
        <div className="w-48">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as DocumentCategory | '')}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon="application"
          title="No documents yet"
          description="Upload a certificate, essay, recommendation letter, or transcript to keep it safe here."
        />
      ) : (
        <div className="space-y-2">
          {shown.map((d) => (
            <Card key={d.documentId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{d.fileName}</p>
                <p className="text-xs text-ink-500">
                  {categoryLabel(d.category)} · {formatBytes(d.sizeBytes)}
                  {d.visibility === 'private' ? ' · Private' : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => void download(d.documentId)}>
                  Download
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(d)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
