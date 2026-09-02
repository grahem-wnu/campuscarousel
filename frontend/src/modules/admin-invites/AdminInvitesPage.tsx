import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, Card, EmptyState, Field, Input, Spinner, useToast } from '../../shared/ui';
import { createInvite, listInvites, revokeInvite } from './api';
import type { Invite } from './types';

export default function AdminInvitesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [creating, setCreating] = useState(false);
  // The link just minted, shown inline with its own Copy button. The auto-copy below is best-effort:
  // iOS Safari refuses clipboard writes that don't happen directly inside a tap (ours follows an
  // await), and a toast is no place to recover a link from.
  const [lastLink, setLastLink] = useState<{ code: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvites(await listInvites());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invites.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.platformAdmin) void load();
    else setLoading(false);
  }, [load, user]);

  if (!user?.platformAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          icon="warning"
          title="Platform admins only"
          description="This console is restricted to the platform administrator."
        />
      </div>
    );
  }

  function linkFor(code: string) {
    return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
  }

  async function copyLink(code: string) {
    const url = linkFor(code);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied.');
    } catch {
      toast.error(`Couldn't copy — share it manually: ${url}`);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const inv = await createInvite({
        ...(email.trim() ? { email: email.trim() } : {}),
        familyName: familyName.trim() || undefined,
      });
      // Link-only invites go straight to the clipboard — the whole point is texting it onward.
      if (inv.email) {
        toast.success(`Invite emailed to ${inv.email} (code ${inv.code}).`);
      } else {
        setLastLink({ code: inv.code, url: linkFor(inv.code) });
        await copyLink(inv.code);
      }
      setEmail('');
      setFamilyName('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create invite.');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(code: string) {
    if (!window.confirm(`Revoke invite ${code}?`)) return;
    try {
      await revokeInvite(code);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Invites</h1>
        <p className="text-sm text-ink-600">
          Invite a new family to Campus Carousel. The link lands them on a sign-up page; they create their own
          private account and land in onboarding.
        </p>
      </header>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-800">Invite a family</h2>
        <p className="text-xs text-ink-500">
          Leave the email blank to get a shareable link (copied to your clipboard) you can text to anyone.
          With an email, the code is emailed and only that address can redeem it.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Family email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" />
          </Field>
          <Field label="Family name (optional)">
            <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Cuthbertson" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button icon="plus" loading={creating} onClick={() => void create()}>
            {email.trim() ? 'Send invite' : 'Create invite link'}
          </Button>
        </div>
        {lastLink ? (
          <Field
            label="Your new invite link"
            hint="Text this to the family. It opens a sign-up page; the link is single-use and expires in 30 days."
          >
            <div className="flex items-center gap-2">
              <Input readOnly value={lastLink.url} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="sm" onClick={() => void copyLink(lastLink.code)}>
                Copy
              </Button>
            </div>
          </Field>
        ) : null}
      </Card>

      <h2 className="text-sm font-semibold text-ink-800">Sent invites</h2>
      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : invites.length === 0 ? (
        <EmptyState icon="contacts" title="No invites yet" description="Send one above to onboard a family." />
      ) : (
        <div className="space-y-2">
          {invites.map((i) => (
            <Card key={i.code} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">
                  <span className="font-mono">{i.code}</span> · {i.email ?? 'shareable link'}
                </p>
                <p className="text-xs text-ink-500">
                  {i.status}
                  {i.familyName ? ` · ${i.familyName}` : ''}
                  {i.expiresAt ? ` · expires ${i.expiresAt.slice(0, 10)}` : ''}
                </p>
              </div>
              {i.status === 'pending' ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void copyLink(i.code)}>
                    Copy link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void revoke(i.code)}>
                    Revoke
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
