import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false, // Stripe braucht den raw body für Signatur-Check
  },
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

  // Wenn Checkout erfolgreich → Subscription Schedule mit Payment Method verknüpfen
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const scheduleId = session.metadata?.subscription_schedule_id;
    const customerId = session.metadata?.customer_id;

    if (scheduleId && customerId) {
      try {
        // Hole die Payment Intent, um die verwendete Karte zu finden
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent
        );
        const paymentMethodId = paymentIntent.payment_method;

        // Karte als Default für den Customer setzen
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        console.log(`✅ Subscription Schedule ${scheduleId} ist bereit. 
          Karte ${paymentMethodId} gespeichert für Customer ${customerId}.`);
      } catch (err) {
        console.error('Fehler beim Verknüpfen:', err);
      }
    }
  }

  res.status(200).json({ received: true });
}
