import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 👇 OFFERS: Hier kannst du beliebig viele Try-and-Buy Varianten definieren
const OFFERS = {
  // Standard Offer: 49,99€ Anzahlung + 14 Tage Trial + 3x 49,99€
  'try_and_buy': {
    name: 'Eye AI – Try & Buy',
    initial_amount: 4999,  // 49,99€ heute
    trial_days: 14,
    restzahlung_price_id: 'price_1TahnIHRgmyzxSInhDPavGrQ',  // 49,99€/Monat
    iterations: 3,
    message: 'Mit der Bestätigung Ihrer Zahlung erklären Sie sich damit einverstanden, dass Removely Ihnen diese und jeweils drei monatliche Zahlungen in Höhe von 49,99 EUR gemäß den AGB belastet. Die Testphase beginnt ab Erhalt. Es gilt zudem das gesetzliche Widerrufsrecht.'
  },
  
  // 👇 NEUES OFFER: 4 × 25€ ratenzahlung ohne Anzahlung
  'ratenzahlung_4x25€': {
    name: 'Eye AI – 4× 25€ Ratenzahlung',
    initial_amount: 25,  // 25€ erste Rate heute
    trial_days: 0,         // KEIN Trial – direkt nach 30 Tagen nächste Rate
    restzahlung_price_id: 'price_1TbhkyHRgmyzxSIn3M3NHMJ4',  // 25€/Monat
    iterations: 3,         // 3 weitere Raten (zusätzlich zur ersten heute = 4 gesamt)
    message: 'ㅤ'
  },
  
  // Hier kannst du in Zukunft beliebig viele weitere Offers hinzufügen
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Welches Offer? Default = try_and_buy (für Abwärtskompatibilität)
    const offerKey = (req.body && req.body.offer) || 'try_and_buy';
    const offer = OFFERS[offerKey];
    
    if (!offer) {
      return res.status(400).json({ error: `Offer "${offerKey}" not found` });
    }

    const origin = (req.headers.origin && req.headers.origin.startsWith('http'))
      ? req.headers.origin : 'https://removely.de';

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      payment_method_types: ['card', 'paypal'],
      customer_creation: 'always',
      locale: 'de',

      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: offer.name,
          },
          unit_amount: offer.initial_amount,
        },
        quantity: 1,
      }],

      payment_intent_data: {
        setup_future_usage: 'off_session',
      },

      shipping_address_collection: {
        allowed_countries: ['DE', 'AT', 'CH'],
      },

      phone_number_collection: {
        enabled: true,
      },

      custom_text: {
        submit: {
          message: offer.message,
        },
      },

      metadata: {
        flow: 'try_and_buy',
        offer_key: offerKey,
        restzahlung_price_id: offer.restzahlung_price_id,
        trial_days: String(offer.trial_days),
        iterations: String(offer.iterations),
      },

      return_url: `${origin}/pages/danke?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
