import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    res.status(200).json({
      status: session.status,
      customer_email: session.customer_details?.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
