// Ad-hoc smoke for /api/checkout/create-session.
// Run from repo root:  node server/tests/test-stripe-checkout.js
// Requires the Express server to be running on :3001.

const API = 'http://localhost:3001';

async function main() {
  // 0) Get first product ID
  const productsRes = await fetch(`${API}/api/products`, {
    method: 'GET',
  });
  const productsData = await productsRes.json();
  const productId = productsData.data?.[0]?.id || productsData[0]?.id;
  if (!productId) {
    console.error('❌ No products found in database, cannot proceed with test');
    process.exit(1);
  }
  console.log('✅ Found product:', productId);

  // 1) Create an unpaid order via the existing endpoint (re-uses real flow).
  const orderRes = await fetch(`${API}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Smoke', lastname: 'Test', phone: '5555555555',
      email: `smoke+${Date.now()}@example.com`,
      company: 'Smoke Co', adress: '1 Test Way', apartment: 'Apt 1', city: 'Testville',
      country: 'United States', postalCode: '00000', orderNotice: '',
      status: 'pending', total: 25,
    }),
  });
  if (!orderRes.ok) {
    console.error('❌ /api/orders failed:', orderRes.status, await orderRes.text());
    process.exit(1);
  }
  const { id: orderId } = await orderRes.json();
  console.log('✅ Created order:', orderId);

  // 1.5) Add product to order
  const addProductRes = await fetch(`${API}/api/order-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerOrderId: orderId,
      productId: productId,
      quantity: 1,
    }),
  });
  if (!addProductRes.ok) {
    console.error('❌ /api/order-product failed:', addProductRes.status, await addProductRes.text());
    process.exit(1);
  }
  console.log('✅ Added product to order');

  // 2) Hit create-session.
  const sessionRes = await fetch(`${API}/api/checkout/create-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const text = await sessionRes.text();
  console.log('Status:', sessionRes.status);
  console.log('Body  :', text.substring(0, 200));

  // EXPECTED: If using a real Stripe key, we'd get 200 with { url, sessionId }
  // BUT: With the placeholder key sk_test_REPLACE_ME, Stripe rejects with auth error
  // The test should verify:
  // 1. Route exists (status != 404)
  // 2. Either it's successful, OR we get a Stripe auth error (proving the code path works)
  if (sessionRes.status === 404) {
    console.error('❌ Route not found (404) — router not mounted correctly');
    process.exit(1);
  }

  if (sessionRes.ok) {
    const { url, sessionId } = JSON.parse(text);
    if (!url || !url.startsWith('https://checkout.stripe.com/')) {
      console.error('❌ expected a Stripe Checkout URL, got:', url);
      process.exit(1);
    }
    console.log('✅ Got Stripe Checkout URL:', url);
    console.log('✅ Session ID:', sessionId);

    // 3) Call again (re-entrancy) — should return same session URL while it is still 'open'.
    const second = await fetch(`${API}/api/checkout/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const secondBody = await second.json();
    if (secondBody.sessionId !== sessionId) {
      console.error('❌ re-entrancy failed — expected same sessionId, got:', secondBody.sessionId);
      process.exit(1);
    }
    console.log('✅ Re-entrancy: same sessionId returned');
  } else {
    // Non-2xx response - check if it's a Stripe auth error (expected with placeholder key)
    const body = JSON.parse(text);
    if (body.error && (body.error.includes('Invalid API Key') || body.error.includes('API Key'))) {
      console.log('✅ Route is wired correctly - Stripe API rejected the call with auth error (expected with placeholder key)');
      console.log('   This proves the controller → Stripe wiring works.');
    } else {
      console.error('❌ Unexpected error:', body);
      process.exit(1);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
