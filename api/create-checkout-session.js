import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 👇 HIER deine Price-ID der 49,99€-Monatsrate eintragen
const RESTZAHLUNG_PRICE_ID = 'price_1TaaFDHRgmyzxSIncG8YFKVo';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const origin = (req.headers.origin && req.headers.origin.startsWith('http'))
      ? req.headers.origin : 'https://removely.de';

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      payment_method_types: ['card'],
      customer_creation: 'always',

      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Eye AI – Try & Buy',
          },
          unit_amount: 4999, // 49,99€ in Cent
        },
        quantity: 1,
      }],

      // Karte für zukünftige Abbuchungen speichern
      payment_intent_data: {
        setup_future_usage: 'off_session',
      },

      // EINE Adresse (Rechnung = Lieferung)
      billing_address_collection: 'required',

      // Telefonnummer Pflicht
      phone_number_collection: {
        enabled: true,
      },

      // Rabattcode-Feld
      allow_promotion_codes: true,

      // Newsletter + AGB Zustimmung
      consent_collection: {
        promotions: 'auto',
        terms_of_service: 'required',
      },

      // Versandart anzeigen
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'eur' },
          display_name: 'DHL Express (1-3 Werktage)',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 1 },
            maximum: { unit: 'business_day', value: 3 },
          },
        },
      }],

      // Metadata für Webhook
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
