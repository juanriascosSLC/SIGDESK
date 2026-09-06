import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { PERMISSIONS } from '@/features/auth/permissions';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { getSrvQuoteSummary } from './api';
import {
  formatMoney,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
} from './presentation';
import type { CoveredTicket, MoneyTotals, VendorQuote, CustomerInvoice } from './types';

/** Route for a covered ticket, by owning domain. INC and PRB are separate
 *  domains with separate surfaces — never one generic ticket route. */
function routeFor(ticket: CoveredTicket): string {
  return ticket.entityKey === 'PRB' ? `/app/problems/${ticket.id}` : `/app/tickets/${ticket.id}`;
}

function permissionFor(ticket: CoveredTicket): string {
  return ticket.entityKey === 'PRB' ? PERMISSIONS.problemsView : PERMISSIONS.ticketsView;
}

/**
 * A covered ticket's visible number, as a link only when the viewer can
 * actually open it.
 *
 * Without the permission check this is a trap: ProtectedRoute falls back to
 * `/portal` (App.tsx), so a Services agent lacking `tickets:read` who clicks
 * through gets ejected from the staff workspace entirely. A link that can
 * throw the user out is worse than no link, so it renders as plain text with
 * the reason in its title attribute.
 */
function CoveredTicketRef({ ticket }: { ticket: CoveredTicket }) {
  const { can } = useAuth();

  if (!can(permissionFor(ticket))) {
    return (
      <span
        data-testid={`srv-covered-ticket-${ticket.humanId}`}
        data-linked="false"
        title={`You do not have permission to open ${ticket.humanId}`}
        className="font-bold text-services-on-surface-variant decoration-dotted underline-offset-2 [text-decoration-line:underline]"
      >
        {ticket.humanId}
      </span>
    );
  }

  return (
    <Link
      to={routeFor(ticket)}
      data-testid={`srv-covered-ticket-${ticket.humanId}`}
      data-linked="true"
      className="font-bold text-services-accent hover:underline"
    >
      {ticket.humanId}
    </Link>
  );
}

/** Amount, or an em dash when the line does not carry this charge. */
function Amount({ value, currency }: { value?: string; currency: string }) {
  if (value === undefined) return <span className="text-services-on-surface-variant">—</span>;
  return <>{formatMoney(value, currency)}</>;
}

function Totals({ totals, currency }: { totals: MoneyTotals; currency: string }) {
  const rows: Array<[string, string, string]> = [
    ['Sub Total', totals.subTotal, ''],
    ['Discount', totals.discount, '− '],
    ['Total (net)', totals.totalNet, ''],
    ['Shipping', totals.shippingCost, '+ '],
    ['Sales tax', totals.salesTax, '+ '],
  ];

  return (
    <dl className="ml-auto mt-4 w-full max-w-xs border-t border-services-border pt-3 text-sm">
      {rows.map(([label, value, sign]) => (
        <div key={label} className="flex justify-between py-1">
          <dt className="text-services-on-surface-variant">{label}</dt>
          <dd className="tabular-nums">
            {sign}
            {formatMoney(value, currency)}
          </dd>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-services-border pt-3 text-base font-black">
        <dt>Total</dt>
        <dd className="tabular-nums" data-testid="srv-totals-grand">
          {formatMoney(totals.total, currency)}
        </dd>
      </div>
    </dl>
  );
}

function VendorQuoteSection({
  quote,
  covered,
}: {
  quote: VendorQuote;
  covered: CoveredTicket[];
}) {
  const byId = new Map(covered.map((ticket) => [ticket.id, ticket]));

  return (
    <section data-testid="srv-vendor-quote">
      <div className="mb-3 flex items-center gap-2">
        <ArrowUpRight className="h-4 w-4 shrink-0 text-services-on-surface-variant" aria-hidden="true" />
        <h3 className="text-xs font-black uppercase tracking-wider text-services-on-surface-variant">
          Subcontractor quote — what we pay
        </h3>
      </div>

      {/* Wide table scrolls inside its own container; the page body never
          scrolls horizontally (docs/design-rules.md R-14). */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-services-on-surface-variant">
              <th className="pb-2 pr-3 font-black">Ticket</th>
              <th className="pb-2 pr-3 text-right font-black">Travel</th>
              <th className="pb-2 pr-3 text-right font-black">Price</th>
              <th className="pb-2 pr-3 text-right font-black">Tax %</th>
              <th className="pb-2 pr-3 text-right font-black">Extra hour</th>
              <th className="pb-2 text-right font-black">Hours</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((line) => {
              const ticket = byId.get(line.ticketId);
              return (
                <tr key={line.ticketId} className="border-t border-services-border align-top">
                  <td className="py-2.5 pr-3">
                    {ticket ? (
                      <>
                        <CoveredTicketRef ticket={ticket} />
                        <p className="mt-0.5 text-xs text-services-on-surface-variant">{ticket.title}</p>
                      </>
                    ) : (
                      <span className="text-services-on-surface-variant">{line.ticketId}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <Amount value={line.travelRate} currency={quote.currency} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <Amount value={line.price} currency={quote.currency} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{line.taxRatePct}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <Amount value={line.additionalHourRate} currency={quote.currency} />
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{line.hourQuantity}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Totals totals={quote.totals} currency={quote.currency} />

      <p className="mt-3 text-xs text-services-on-surface-variant">
        Travel is charged once for the whole visit, not per ticket.
      </p>
    </section>
  );
}

function CustomerInvoiceSection({ invoice }: { invoice: CustomerInvoice }) {
  return (
    <section data-testid="srv-customer-invoice" className="border-t border-services-border pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowDownLeft className="h-4 w-4 shrink-0 text-services-on-surface-variant" aria-hidden="true" />
          <h3 className="text-xs font-black uppercase tracking-wider text-services-on-surface-variant">
            Dealership invoice — what we charge
          </h3>
        </div>
        <StatusBadge
          label={INVOICE_STATUS_LABELS[invoice.status]}
          tone={INVOICE_STATUS_TONES[invoice.status]}
        />
      </div>
      <Totals totals={invoice.totals} currency={invoice.currency} />
    </section>
  );
}

export interface QuoteCardProps {
  srvId: string;
  coveredTickets: CoveredTicket[];
}

/**
 * Both money documents for one service visit (Recommended Approach step 5).
 *
 * Two documents, opposite directions, always labelled: the subcontractor
 * quote is what SIG Systems pays, the dealership invoice is what it charges.
 * The card never shows a margin or a difference between them — deriving that
 * would be computing money in the client (docs/design-rules.md R-8).
 *
 * Read-only. Building or editing a quote is out of scope for PR2.
 */
export function QuoteCard({ srvId, coveredTickets }: QuoteCardProps) {
  const summary = useQuery({
    queryKey: ['services', 'srv-quote', srvId],
    queryFn: () => getSrvQuoteSummary(srvId),
  });

  if (summary.isLoading) {
    return (
      <Card data-testid="srv-quote-card">
        <LoadingState label="Loading quote and invoice…" compact />
      </Card>
    );
  }

  // Panel-level error: the rest of SrvDetail stays up.
  if (summary.isError || !summary.data) {
    return (
      <Card data-testid="srv-quote-card">
        <ErrorState
          error={summary.error}
          title="Could not load this visit's quote"
          onRetry={() => summary.refetch()}
          compact
        />
      </Card>
    );
  }

  const { vendorQuote, customerInvoice } = summary.data;

  if (!vendorQuote && !customerInvoice) {
    return (
      <Card data-testid="srv-quote-card">
        <CardHeader>
          <CardTitle>Quote and invoice</CardTitle>
        </CardHeader>
        <p data-testid="srv-quote-empty" className="text-sm text-services-on-surface-variant">
          This visit has not been quoted yet.
        </p>
      </Card>
    );
  }

  return (
    <Card data-testid="srv-quote-card" className="space-y-5">
      <CardHeader>
        <CardTitle>Quote and invoice</CardTitle>
      </CardHeader>

      {vendorQuote ? (
        <VendorQuoteSection quote={vendorQuote} covered={coveredTickets} />
      ) : (
        <p data-testid="srv-vendor-quote-empty" className="text-sm text-services-on-surface-variant">
          No subcontractor quote for this visit yet.
        </p>
      )}

      {customerInvoice ? (
        <CustomerInvoiceSection invoice={customerInvoice} />
      ) : (
        <p
          data-testid="srv-customer-invoice-empty"
          className="border-t border-services-border pt-5 text-sm text-services-on-surface-variant"
        >
          The dealership has not been invoiced yet.
        </p>
      )}
    </Card>
  );
}
