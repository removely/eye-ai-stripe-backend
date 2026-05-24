import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // CORS-Header: erlaubt deinem Shopify-Shop, diese API aufzurufen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
const origin = (req.headers.origin && req.headers.origin.startsWith('http')) ? req.headers.origin : 'https://removely.de';
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Eye AI Smart Glasses – Anzahlung',
            description: '49,99€ Anzahlung. 14 Tage testen.',
          },
          unit_amount: 4999, // 49,99€ in Cent
        },
        quantity: 1,
      }],
      mode: 'payment',
      return_url: `${origin}/pages/danke?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
