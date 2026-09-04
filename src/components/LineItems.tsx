import { useEffect, useRef } from 'react';
import { useApp } from '../store';
import { formatMoney, parseNumber, computeTotals } from '../lib/money';
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from './Icons';

export function LineItems() {
  const doc = useApp((s) => s.doc);
  const addItem = useApp((s) => s.addItem);
  const duplicateItem = useApp((s) => s.duplicateItem);
  const updateItem = useApp((s) => s.updateItem);
  const removeItem = useApp((s) => s.removeItem);
  const moveItem = useApp((s) => s.moveItem);
  const patchDoc = useApp((s) => s.patchDoc);
  const lastItemId = useApp((s) => s.lastItemId);
  const listRef = useRef<HTMLUListElement | null>(null);

  const totals = computeTotals(doc.items, doc.discount);

  useEffect(() => {
    if (!lastItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLInputElement>(
      `[data-item-id="${lastItemId}"] input[data-field="description"]`,
    );
    el?.focus();
  }, [lastItemId]);

  const onRowKey = (
    id: string,
    field: 'description' | 'qty' | 'unit' | 'tax',
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateItem(id);
      return;
    }
    if (e.key === 'Enter' && field === 'unit') {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <div>
      <div className="hidden sm:grid grid-cols-[1fr_4.5rem_6rem_4.5rem_auto] gap-2 px-1 mb-1.5">
        <span className="label mb-0">Description</span>
        <span className="label mb-0 text-right">Qty</span>
        <span className="label mb-0 text-right">Unit</span>
        <span className="label mb-0 text-right">Tax %</span>
        <span className="label mb-0 w-16 text-right">Amount</span>
      </div>

      <ul className="flex flex-col gap-2" ref={listRef}>
        {doc.items.map((item, index) => {
          const rowTotal = Math.round(item.qty * item.unitPrice * 100);
          return (
            <li
              key={item.id}
              data-testid="line-item"
              data-item-id={item.id}
              className="grid grid-cols-2 sm:grid-cols-[1fr_4.5rem_6rem_4.5rem_auto] gap-2 items-start group"
            >
              <input
                className="field col-span-2 sm:col-span-1"
                dir="auto"
                data-field="description"
                placeholder="What are you charging for?"
                aria-label={`Description for line ${index + 1}`}
                value={item.description}
                onChange={(e) => updateItem(item.id, { description: e.target.value })}
                onKeyDown={(e) => onRowKey(item.id, 'description', e)}
              />
              <input
                className="field text-right"
                inputMode="decimal"
                data-field="qty"
                aria-label={`Quantity for line ${index + 1}`}
                value={item.qty === 0 ? '' : String(item.qty)}
                placeholder="0"
                onChange={(e) => updateItem(item.id, { qty: parseNumber(e.target.value) })}
                onKeyDown={(e) => onRowKey(item.id, 'qty', e)}
              />
              <input
                className="field text-right"
                inputMode="decimal"
                data-field="unit"
                aria-label={`Unit price for line ${index + 1}`}
                value={item.unitPrice === 0 ? '' : String(item.unitPrice)}
                placeholder="0.00"
                onChange={(e) => updateItem(item.id, { unitPrice: parseNumber(e.target.value) })}
                onKeyDown={(e) => onRowKey(item.id, 'unit', e)}
              />
              <input
                className="field text-right"
                inputMode="decimal"
                data-field="tax"
                aria-label={`Tax rate for line ${index + 1}`}
                value={item.taxRate === 0 ? '' : String(item.taxRate)}
                placeholder="0"
                onChange={(e) => updateItem(item.id, { taxRate: parseNumber(e.target.value) })}
                onKeyDown={(e) => onRowKey(item.id, 'tax', e)}
              />
              <div className="flex items-center justify-end gap-1 sm:w-auto col-span-2 sm:col-span-1">
                <span className="w-16 text-right text-sm tabular-nums font-semibold">
                  {formatMoney(rowTotal, doc.currency)}
                </span>
                <div className="flex">
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-faint hover:text-ink disabled:opacity-30"
                    onClick={() => moveItem(item.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move line ${index + 1} up`}
                  >
                    <IconChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-faint hover:text-ink disabled:opacity-30"
                    onClick={() => moveItem(item.id, 1)}
                    disabled={index === doc.items.length - 1}
                    aria-label={`Move line ${index + 1} down`}
                  >
                    <IconChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-faint hover:text-red-600"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn btn-ghost mt-3" onClick={addItem}>
        <IconPlus className="w-3.5 h-3.5" />
        Add line
      </button>
      <p className="text-[11px] text-muted mt-1.5">
        Enter on unit price adds a row. Ctrl/Cmd+D duplicates the current row.
      </p>

      <div className="mt-4 pt-3 border-t border-edge flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between text-muted font-medium">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(totals.subtotal, doc.currency)}</span>
        </div>
        <div className="flex justify-between items-center text-muted font-medium">
          <label className="flex items-center gap-2" htmlFor="discount">
            Discount
            <input
              id="discount"
              className="field w-16 py-1 text-right"
              inputMode="decimal"
              value={doc.discount === 0 ? '' : String(doc.discount)}
              placeholder="0"
              onChange={(e) => patchDoc({ discount: parseNumber(e.target.value) })}
            />
            %
          </label>
          <span className="tabular-nums">
            {totals.discount > 0 ? `-${formatMoney(totals.discount, doc.currency)}` : '—'}
          </span>
        </div>
        {totals.taxByRate.map((t) => (
          <div key={t.rate} className="flex justify-between text-muted font-medium">
            <span>Tax {t.rate}%</span>
            <span className="tabular-nums">{formatMoney(t.amount, doc.currency)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-base pt-1.5 border-t border-edge">
          <span>Total</span>
          <span className="tabular-nums" data-testid="grand-total">
            {formatMoney(totals.total, doc.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
