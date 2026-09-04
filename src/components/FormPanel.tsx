import { useState } from 'react';
import { useApp } from '../store';
import { CURRENCIES } from '../lib/money';
import { PRICE } from '../config';
import { LineItems } from './LineItems';
import { SignaturePad } from './SignaturePad';
import { LogoUploader } from './LogoUploader';
import { isHexColor } from '../lib/color';

function Section({
  title,
  hint,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="bg-panel border border-edge rounded-xl group"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 min-h-11 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
          {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
        </span>
        <span className="text-brand text-lg leading-none group-open:rotate-45 transition-transform" aria-hidden>
          +
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
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
          dir="auto"
          className="field resize-y min-h-[4.5rem]"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          dir={type === 'date' ? undefined : 'auto'}
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
  const setSignatureImage = useApp((s) => s.setSignatureImage);
  const rememberProfile = useApp((s) => s.rememberProfile);
  const saveRevision = useApp((s) => s.saveRevision);
  const openUpgrade = useApp((s) => s.openUpgrade);

  return (
    <div className="flex flex-col gap-3">
      <Section title="Sender profile" hint="Your business. Saved as a preset if you want.">
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
            type="tel"
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
          <Field
            label="VAT or tax ID"
            value={doc.issuer.taxId}
            onChange={(v) => patchParty('issuer', { taxId: v })}
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

        <div className="mt-4 pt-3 border-t border-edge">
          <LogoUploader />
        </div>

        <div className="mt-4 pt-3 border-t border-edge">
          <span className="label">Brand colour on the document</span>
          <p className="text-xs text-muted mb-2">
            Table headers, rules and the total. {isPro ? 'Included in the PDF.' : `Preview now; PDF export is Pro (${PRICE.display}).`}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Brand colour"
              className="h-10 w-14 rounded-lg border border-edge-strong bg-panel cursor-pointer"
              value={isHexColor(doc.brandColor) ? doc.brandColor : '#4F46E5'}
              onChange={(e) => patchDoc({ brandColor: e.target.value })}
              data-testid="brand-color"
            />
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => patchDoc({ brandColor: null })}
              disabled={!doc.brandColor}
            >
              Use template default
            </button>
          </div>
        </div>

        {isPro && (
          <label className="mt-4 pt-3 border-t border-edge flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={!doc.showCredit}
              onChange={(e) => patchDoc({ showCredit: !e.target.checked })}
              data-testid="hide-credit"
            />
            <span>
              <span className="font-semibold">Remove footer credit</span>
              <span className="block text-xs text-muted mt-0.5">
                Hide “Made with makefastquote.com”. The legal quotation disclaimer always prints.
              </span>
            </span>
          </label>
        )}

        <button type="button" className="btn btn-ghost mt-4 text-xs" onClick={rememberProfile}>
          Save as my default profile
        </button>
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
            type="tel"
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
            label="Quote number"
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
            label="Date"
            type="date"
            value={doc.issueDate}
            onChange={(v) => patchDoc({ issueDate: v })}
          />
          <Field
            label="Valid until"
            type="date"
            value={doc.dueDate}
            onChange={(v) => patchDoc({ dueDate: v })}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted">
            Revision v{Math.max(1, doc.revision || 1)}
            {doc.revision > 1 ? ` · prints as ${doc.reference || '—'}-v${doc.revision}` : ''}. Drafts
            stay fully editable.
          </p>
          <button type="button" className="btn btn-ghost text-xs" onClick={saveRevision}>
            Save as new revision
          </button>
        </div>
      </Section>

      <Section title="Line items">
        <LineItems />
      </Section>

      <Section
        title="Notes & terms"
        hint="Scope, validity, and how official tax invoices are issued later."
      >
        <Field
          label="Bank details"
          area
          value={doc.issuer.bank}
          onChange={(v) => patchParty('issuer', { bank: v })}
          placeholder="IBAN · SWIFT / BIC"
        />
        <div className="mt-3">
          <label className="label" htmlFor="notes-terms">
            Notes & terms
          </label>
          <textarea
            id="notes-terms"
            dir="auto"
            className="field resize-y min-h-[6rem]"
            value={doc.notes}
            placeholder="Official tax invoices will be issued separately upon payment or project completion."
            onChange={(e) => patchDoc({ notes: e.target.value })}
            aria-label="Notes and terms"
          />
          <p className="text-[11px] text-faint mt-1.5 leading-snug">
            A legal disclaimer also prints in the footer of every preview and PDF. It cannot be
            removed.
          </p>
        </div>
      </Section>

      <Section title="Signature & sign-off" hint="Draw, or upload a photo of a signature.">
        <SignaturePad
          strokes={doc.signature}
          onChange={setSignature}
          image={doc.signatureImage}
          onImageChange={setSignatureImage}
        />
        <div className="mt-3">
          <Field
            label="Printed name under the line"
            value={doc.signatureName}
            onChange={(v) => patchDoc({ signatureName: v })}
            placeholder={doc.issuer.name || 'Jane Doe'}
          />
        </div>
      </Section>

      {!isPro && (doc.logo || doc.brandColor) && (
        <p className="text-xs text-muted px-1">
          The canvas is showing your branding. Downloading the PDF will ask you to unlock Pro — or
          you can export without the logo.{' '}
          <button type="button" className="text-brand font-semibold underline" onClick={() => openUpgrade('logo-export')}>
            Unlock Pro — {PRICE.display}
          </button>
        </p>
      )}
    </div>
  );
}
