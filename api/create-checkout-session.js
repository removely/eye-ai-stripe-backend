import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 👇 HIER deine Price-ID der 50€-Monatsrate eintragen
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

    // 1. Kunde in Stripe erstellen (damit wir später eine Subscription draufsetzen können)
    const customer = await stripe.customers.create();

    // 2. Subscription Schedule erstellen:
    //    - Phase 1: 14 Tage Trial (0€)
    //    - Phase 2: 3 Monate à 50€
    //    - Danach: automatisch beenden
    const schedule = await stripe.subscriptionSchedules.create({
      customer: customer.id,
      start_date: 'now',
      end_behavior: 'cancel', // Nach den 3 Raten automatisch beenden
      phases: [
        {
          // Phase 1: 14-Tage-Trial (kostenlos)
          items: [{ price: RESTZAHLUNG_PRICE_ID, quantity: 1 }],
          trial: true,
          iterations: 1,
          // Trial-Länge: wir nutzen die Phase als Trial-Periode
        },
        {
          // Phase 2: 3 monatliche Zahlungen à 50€
          items: [{ price: RESTZAHLUNG_PRICE_ID, quantity: 1 }],
          iterations: 3,
        }
      ],
    });

    // 3. Checkout Session erstellen:
    //    - Mode: payment (für die einmalige Anzahlung)
    //    - + Karte wird gespeichert für die spätere Subscription
    //    - + Customer ist verknüpft (damit die Subscription später aktiviert wird)
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      customer: customer.id,
      mode: 'payment',
      payment_method_types: ['card', 'paypal'], // Karte + PayPal für die Anzahlung
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Eye AI Smart Glasses – Anzahlung',
            description: '49,99€ Anzahlung. 14 Tage testen, dann 3x 50€ monatlich.',
          },
          unit_amount: 4999,
        },
        quantity: 1,
      }],
      // WICHTIG: Karte für zukünftige Abbuchungen speichern
      payment_intent_data: {
        setup_future_usage: 'off_session',
      },
      // Metadata: damit wir später wissen, welche Schedule zum Kauf gehört
      metadata: {
        subscription_schedule_id: schedule.id,
        customer_id: customer.id,
      },
      return_url: `${origin}/pages/danke?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
