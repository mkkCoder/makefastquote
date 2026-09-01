import { useRef } from 'react';
import { useApp } from '../store';
import { CURRENCIES } from '../lib/money';
import { LineItems } from './LineItems';
import { SignaturePad } from './SignaturePad';
import { IconLock, IconUpload, IconX } from './Icons';

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-panel border border-edge rounded-xl p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <p className="text-xs text-faint mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  area = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  area?: boolean;
}) {
  const id = `f-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {area ? (
        <textarea
          id={id}
          className="field resize-y min-h-[4.5rem]"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          className="field"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function FormPanel() {
  const doc = useApp((s) => s.doc);
  const isPro = useApp((s) => s.isPro);
  const patchDoc = useApp((s) => s.patchDoc);
  const patchParty = useApp((s) => s.patchParty);
  const setSignature = useApp((s) => s.setSignature);
  const setLogo = useApp((s) => s.setLogo);
  const openUpgrade = useApp((s) => s.openUpgrade);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onLogoPicked = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      // A 5 MB logo blows the localStorage quota and takes the autosave with
      // it, so refuse early with a reason rather than failing silently later.
      alert('That image is over 1.5 MB. Please use a smaller logo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Your details" hint="Appears at the top of the document.">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Business or your name"
            value={doc.issuer.name}
            onChange={(v) => patchParty('issuer', { name: v })}
            placeholder="Jane Doe Design"
          />
          <Field
            label="Email"
            type="email"
            value={doc.issuer.email}
            onChange={(v) => patchParty('issuer', { email: v })}
            placeholder="jane@example.com"
          />
          <Field
            label="Phone"
            value={doc.issuer.phone}
            onChange={(v) => patchParty('issuer', { phone: v })}
            placeholder="Optional"
          />
          <Field
            label="Contact name"
            value={doc.issuer.contact}
            onChange={(v) => patchParty('issuer', { contact: v })}
            placeholder="Optional"
          />
          <div className="sm:col-span-2">
            <Field
              label="Address"
              area
              value={doc.issuer.address}
              onChange={(v) => patchParty('issuer', { address: v })}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-edge">
          <span className="label">Logo</span>
          {isPro && doc.logo ? (
            <div className="flex items-center gap-3">
              <img
                src={doc.logo}
                alt="Your logo"
                className="h-10 max-w-32 object-contain bg-white rounded border border-edge p-1"
              />
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setLogo(null)}
              >
                <IconX className="w-3 h-3" />
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="logo-button"
              className="btn btn-ghost w-full justify-start"
              onClick={() => {
                if (!isPro) {
                  openUpgrade('your own logo');
                  return;
                }
                fileRef.current?.click();
              }}
            >
              {isPro ? <IconUpload className="w-3.5 h-3.5" /> : <IconLock className="w-3.5 h-3.5" />}
              {isPro ? 'Upload a logo' : 'Add your logo'}
              {!isPro && <span className="ml-auto text-xs text-brand font-semibold">Pro</span>}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              onLogoPicked(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </Section>

      <Section title="Client details">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Company"
            value={doc.client.name}
            onChange={(v) => patchParty('client', { name: v })}
            placeholder="Acme Ltd"
          />
          <Field
            label="Contact person"
            value={doc.client.contact}
            onChange={(v) => patchParty('client', { contact: v })}
            placeholder="Sam Rivera"
          />
          <Field
            label="Email"
            type="email"
            value={doc.client.email}
            onChange={(v) => patchParty('client', { email: v })}
            placeholder="sam@acme.com"
          />
          <Field
            label="Phone"
            value={doc.client.phone}
            onChange={(v) => patchParty('client', { phone: v })}
            placeholder="Optional"
          />
          <div className="sm:col-span-2">
            <Field
              label="Billing address"
              area
              value={doc.client.address}
              onChange={(v) => patchParty('client', { address: v })}
            />
          </div>
        </div>
      </Section>

      <Section title="Document">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Reference"
            value={doc.reference}
            onChange={(v) => patchDoc({ reference: v })}
            placeholder="2026-001"
          />
          <div>
            <label className="label" htmlFor="currency">
              Currency
            </label>
            <select
              id="currency"
              className="field"
              value={doc.currency}
              onChange={(e) => patchDoc({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={doc.kind === 'invoice' ? 'Issue date' : 'Date'}
            type="date"
            value={doc.issueDate}
            onChange={(v) => patchDoc({ issueDate: v })}
          />
          <Field
            label={doc.kind === 'invoice' ? 'Due date' : 'Valid until'}
            type="date"
            value={doc.dueDate}
            onChange={(v) => patchDoc({ dueDate: v })}
          />
        </div>
      </Section>

      <Section title="Line items">
        <LineItems />
      </Section>

      <Section
        title={doc.kind === 'invoice' ? 'Payment terms' : 'Notes & terms'}
        hint={
          doc.kind === 'invoice'
            ? 'Bank details, payment window, late fees.'
            : 'Scope, schedule, how long the quote stands.'
        }
      >
        <textarea
          className="field resize-y min-h-[6rem]"
          value={doc.notes}
          placeholder={
            doc.kind === 'invoice'
              ? 'Payment due within 30 days. Bank: …'
              : 'This proposal is valid for 30 days. 50% due on acceptance.'
          }
          onChange={(e) => patchDoc({ notes: e.target.value })}
          aria-label="Notes and terms"
        />
      </Section>

      <Section title="Signature">
        <SignaturePad strokes={doc.signature} onChange={setSignature} />
        <div className="mt-3">
          <Field
            label="Printed name under the line"
            value={doc.signatureName}
            onChange={(v) => patchDoc({ signatureName: v })}
            placeholder={doc.issuer.name || 'Jane Doe'}
          />
        </div>
      </Section>
    </div>
  );
}
