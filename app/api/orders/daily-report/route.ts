import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { supabaseServer } from '@/lib/supabase-server';
import { formatKsh } from '@/lib/format';

// Always compute against live data, never a cached response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Nairobi is UTC+3, no DST.

// Returns the [start, end) UTC instants for "today" in Nairobi time, plus a
// human label — the report is always scoped to the current day, so it
// naturally starts fresh with no data to reset each morning.
function getNairobiDayRangeUtc(now: Date) {
  const nairobiNow = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const y = nairobiNow.getUTCFullYear();
  const m = nairobiNow.getUTCMonth();
  const d = nairobiNow.getUTCDate();
  const startNairobi = Date.UTC(y, m, d, 0, 0, 0);
  const endNairobi = Date.UTC(y, m, d + 1, 0, 0, 0);

  return {
    startUtc: new Date(startNairobi - NAIROBI_OFFSET_MS),
    endUtc: new Date(endNairobi - NAIROBI_OFFSET_MS),
    label: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`,
    fileLabel: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

interface DailyReportModifier {
  name: string;
  price: number;
}

interface DailyReportOrderItem {
  quantity: number;
  size: 'single' | 'double' | null;
  menu_items: { name: string } | null;
  order_item_modifiers: { modifiers: DailyReportModifier | null }[];
}

interface DailyReportOrder {
  id: string;
  order_number: number;
  total_amount: number;
  customer_name: string | null;
  created_at: string;
  order_items: DailyReportOrderItem[];
}

export async function GET(req: NextRequest) {
  // Only logged-in staff can pull the day's revenue and customer list —
  // require the same Supabase session token the kitchen dashboard already has.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { startUtc, endUtc, label, fileLabel } = getNairobiDayRangeUtc(new Date());

  const { data: orders, error } = await supabaseServer
    .from('orders')
    .select(
      'id, order_number, total_amount, customer_name, created_at, order_items(quantity, size, menu_items(name), order_item_modifiers(modifiers(name, price)))'
    )
    .gte('created_at', startUtc.toISOString())
    .lt('created_at', endUtc.toISOString())
    // Only orders that actually completed payment count toward the day's
    // revenue — carts abandoned before paying, and M-Pesa prompts that
    // failed/expired/were never answered, must not inflate the recap.
    .in('status', ['paid', 'preparing', 'ready', 'completed'])
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (orders ?? []) as unknown as DailyReportOrder[];
  const total = rows.reduce((sum, o) => sum + (o.total_amount ?? 0), 0);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(20).font('Helvetica-Bold').text('SOS Caffè', { align: 'center' });
  doc
    .fontSize(12)
    .font('Helvetica')
    .fillColor('#6B4A31')
    .text(`Daily recap — ${label}`, { align: 'center' });
  doc.moveDown(1.5);
  doc.fillColor('#000000');

  if (rows.length === 0) {
    doc.fontSize(12).text('No orders recorded today.');
  } else {
    rows.forEach((o) => {
      const time = new Date(o.created_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Nairobi',
      });
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`#${o.order_number} — ${time} — ${o.customer_name ?? 'Customer'}`);

      const items = o.order_items ?? [];
      if (items.length === 0) {
        doc.fontSize(10).font('Helvetica').text('—');
      } else {
        items.forEach((it) => {
          const sizeLabel = it.size ? ` (${it.size === 'single' ? 'single' : 'double'})` : '';
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`${it.quantity}× ${it.menu_items?.name ?? 'Item'}${sizeLabel}`);

          const mods = (it.order_item_modifiers ?? [])
            .map((m) => m.modifiers)
            .filter((m): m is DailyReportModifier => !!m);
          if (mods.length > 0) {
            const modsLine = mods
              .map((m) => (m.price > 0 ? `${m.name} (+${formatKsh(m.price)})` : m.name))
              .join(', ');
            doc
              .fontSize(9)
              .font('Helvetica-Oblique')
              .fillColor('#555555')
              .text(`+ ${modsLine}`, { indent: 14 });
            doc.fillColor('#000000');
          }
        });
      }

      doc.fontSize(10).font('Helvetica').text(`Amount: ${formatKsh(o.total_amount)}`);
      doc.moveDown(0.6);
    });
  }

  doc.moveDown(0.8);
  doc
    .moveTo(40, doc.y)
    .lineTo(555, doc.y)
    .strokeColor('#C49A45')
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.8);

  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1F3B2E');
  doc.text(`Number of orders: ${rows.length}`);
  doc.text(`Total revenue: ${formatKsh(total)}`);

  doc.end();
  const pdfBuffer = await done;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recap-sos-caffe-${fileLabel}.pdf"`,
    },
  });
}
