import 'server-only';

// Thin client for Safaricom's Daraja API (Lipa Na M-Pesa Online / STK Push).
// Switches between the sandbox and production hosts based on MPESA_ENV so
// the exact same code path is used for testing and for real payments —
// going live is an environment-variable change, not a code change.

const BASE_URL =
  process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be defined.`);
  return value;
}

// Africa/Nairobi is UTC+3 year-round (no DST) — Daraja expects the
// timestamp/password in the shortcode's local time, not UTC.
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

function nairobiTimestamp(now: Date): string {
  const nairobiNow = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    nairobiNow.getUTCFullYear().toString() +
    pad(nairobiNow.getUTCMonth() + 1) +
    pad(nairobiNow.getUTCDate()) +
    pad(nairobiNow.getUTCHours()) +
    pad(nairobiNow.getUTCMinutes()) +
    pad(nairobiNow.getUTCSeconds())
  );
}

// Converts a local Kenyan number (07XXXXXXXX or 01XXXXXXXX) to the 2547XXXXXXXX
// / 2541XXXXXXXX format Daraja requires. Assumes the caller already validated
// the input shape (see the /^0[17]\d{8}$/ check in the checkout form).
export function toMsisdn(localPhone: string): string {
  const digits = localPhone.trim().replace(/\D/g, '');
  return `254${digits.slice(1)}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const consumerKey = requireEnv('MPESA_CONSUMER_KEY');
  const consumerSecret = requireEnv('MPESA_CONSUMER_SECRET');
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get M-Pesa access token (${res.status}).`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: string };
  // Refresh a little early (60s margin) rather than right at expiry.
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || '3599') - 60) * 1000,
  };
  return cachedToken.value;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
}

// Initiates an STK push: the customer gets a prompt on their phone to enter
// their M-Pesa PIN. The actual outcome (success/cancel/timeout) arrives
// later via the callback Safaricom posts to callbackUrl — this call only
// confirms the prompt was sent, not that payment happened.
export async function initiateStkPush(params: {
  phone: string; // local format, e.g. 0712345678
  amount: number;
  accountReference: string; // shown to the customer, e.g. "SOS Caffe #12"
  transactionDesc: string;
  callbackUrl: string;
}): Promise<StkPushResult> {
  const shortCode = requireEnv('MPESA_SHORTCODE');
  const passkey = requireEnv('MPESA_PASSKEY');
  // CustomerPayBillOnline for a Paybill shortcode, CustomerBuyGoodsOnline for
  // a Till (Buy Goods) shortcode. Defaults to the sandbox's only supported
  // value so local/sandbox testing works with no extra config.
  const transactionType = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline';

  const timestamp = nairobiTimestamp(new Date());
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
  const msisdn = toMsisdn(params.phone);
  // M-Pesa only accepts whole-shilling amounts.
  const amount = Math.round(params.amount);

  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: amount,
      PartyA: msisdn,
      PartyB: shortCode,
      PhoneNumber: msisdn,
      CallBackURL: params.callbackUrl,
      AccountReference: params.accountReference,
      TransactionDesc: params.transactionDesc,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ResponseCode !== '0') {
    const reason = data.errorMessage || data.ResponseDescription || `HTTP ${res.status}`;
    throw new Error(`M-Pesa STK push request was rejected: ${reason}`);
  }

  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
  };
}

export interface StkCallbackItem {
  Name: string;
  Value?: string | number;
}

export interface StkCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: StkCallbackItem[] };
    };
  };
}

// Pulls a named value (Amount, MpesaReceiptNumber, PhoneNumber, ...) out of
// the callback's CallbackMetadata.Item array, which only exists on success.
export function getCallbackMetadataValue(
  body: StkCallbackBody,
  name: string
): string | number | undefined {
  return body.Body.stkCallback.CallbackMetadata?.Item.find((i) => i.Name === name)?.Value;
}
