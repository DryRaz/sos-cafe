import 'server-only';
import type { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// Resolves the staff member behind the Supabase session token the kitchen
// dashboard sends as "Authorization: Bearer <token>". Returns null for a
// missing/invalid token or a logged-in user who isn't in the staff table.
export async function getStaffFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: staff } = await supabaseServer
    .from('staff')
    .select('id, role')
    .eq('auth_id', userData.user.id)
    .maybeSingle();

  return staff;
}
