import { ImageResponse } from 'next/og';

export const dynamicParams = false;

const VARIANTS: Record<string, { size: number; scale: number; radius: number }> = {
  '192': { size: 192, scale: 0.62, radius: 0 },
  '512': { size: 512, scale: 0.62, radius: 0 },
  // Maskable: logo kept inside the central safe zone, full-bleed background.
  maskable: { size: 512, scale: 0.46, radius: 0 },
  // iOS applies its own rounded corners.
  apple: { size: 180, scale: 0.6, radius: 0 },
};

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const v = VARIANTS[params.name];
  if (!v) return new Response('Not found', { status: 404 });
  const logo = Math.round(v.size * v.scale);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1F3B2E',
        }}
      >
        <svg width={logo} height={logo} viewBox="0 0 40 40" fill="none">
          <path
            d="M20 4C11 4 5 11 5 20c0 9 6 16 15 16s15-7 15-16c0-3-1-6-2-8"
            stroke="#F6F0E4"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M13 22c2-6 8-9 14-8-1 6-6 10-12 10-1 0-1.5-1-2-2z" fill="#C49A45" />
        </svg>
      </div>
    ),
    { width: v.size, height: v.size },
  );
}
