import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 👇 NEUE 50€ Price-ID hier eintragen!
const RESTZAHLUNG_PRICE_ID = 'price_1TaafDHRgmyzxSIncG8YFKVo';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const origin = (req.headers.origin && req.headers.origin.startsWith('http'))
      ? req.headers.origin : 'https://removely.de';

    // NUR Checkout Session erstellen – KEIN Customer/Schedule vorab
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      payment_method_types: ['card', 'paypal'],
      
      // Customer wird automatisch erstellt wenn nötig (über E-Mail-Eingabe im Checkout)
      customer_creation: 'always',
      
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Eye AI Smart Glasses – Anzahlung',
          },
          unit_amount: 4999,
        },
        quantity: 1,
      }],
      
      // WICHTIG: Karte für zukünftige Abbuchungen speichern
      payment_intent_data: {
        setup_future_usage: 'off_session',
      },
      
      // Metadata: damit der Webhook weiß, dass er einen Schedule anlegen soll
      metadata: {
        flow: 'try_and_buy',
        restzahlung_price_id: RESTZAHLUNG_PRICE_ID,
      },
      
      return_url: `${origin}/pages/danke?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
