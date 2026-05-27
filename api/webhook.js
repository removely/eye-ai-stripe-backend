import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Bei erfolgreicher Zahlung → Subscription Schedule erstellen
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Nur für Try-and-Buy-Flow
    if (session.metadata?.flow !== 'try_and_buy') {
      return res.status(200).json({ received: true });
    }

    const customerId = session.customer;
    const restzahlungPriceId = session.metadata.restzahlung_price_id;

    try {
      // 1. Payment Method aus der erfolgreichen Zahlung holen
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const paymentMethodId = paymentIntent.payment_method;

      // 2. Karte als Standard-Zahlungsmethode für Customer setzen
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // 3. Subscription Schedule erstellen: 14 Tage Trial → 3x 50€
     // Werte aus Metadata lesen (dynamisch je nach Offer)
const trialDays = parseInt(session.metadata.trial_days || '14');
const iterations = parseInt(session.metadata.iterations || '3');

const trialEnd = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60);

const schedule = await stripe.subscriptionSchedules.create({
  customer: customerId,
  start_date: trialEnd,
  end_behavior: 'cancel',
  phases: [{
    items: [{ price: restzahlungPriceId, quantity: 1 }],
    iterations: iterations,
    default_payment_method: paymentMethodId,
  }],
});

      console.log(`✅ Schedule ${schedule.id} angelegt für Customer ${customerId}`);
    } catch (err) {
      console.error('Fehler beim Schedule-Erstellen:', err);
    }
  }

  res.status(200).json({ received: true });
}
