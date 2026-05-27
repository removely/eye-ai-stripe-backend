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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.metadata?.flow !== 'try_and_buy') {
      return res.status(200).json({ received: true });
    }

    const customerId = session.customer;
    const restzahlungPriceId = session.metadata.restzahlung_price_id;
    
    // 👇 NEU: Trial-Days und Iterations dynamisch aus Metadata
    const trialDays = parseInt(session.metadata.trial_days || '14');
    const iterations = parseInt(session.metadata.iterations || '3');

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const paymentMethodId = paymentIntent.payment_method;

      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // 👇 NEU: trial_days dynamisch (0 oder 14 oder beliebig)
      // Bei trial_days=0 startet die erste Folgerate nach 30 Tagen
      const trialEnd = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60);
      
      const schedule = await stripe.subscriptionSchedules.create({
        customer: customerId,
        start_date: trialEnd,
        end_behavior: 'cancel',
        phases: [{
          items: [{ price: restzahlungPriceId, quantity: 1 }],
          iterations: iterations,  // 👈 dynamisch
          default_payment_method: paymentMethodId,
        }],
      });

      console.log(`✅ Schedule ${schedule.id} angelegt für Customer ${customerId} (Offer: ${session.metadata.offer_key}, ${trialDays}d Trial, ${iterations} Raten)`);
    } catch (err) {
      console.error('Fehler beim Schedule-Erstellen:', err);
    }
  }

  res.status(200).json({ received: true });
}
