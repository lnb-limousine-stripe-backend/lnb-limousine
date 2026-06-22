// L&B Limousine Services — Stripe backend
//
// This is the minimal server your booking page talks to. It creates a
// Stripe PaymentIntent for the fare amount and hands back a client secret.
// Your Stripe SECRET key lives only here, never in the browser.
//
// Run locally:
//   npm install
//   cp .env.example .env   (then fill in your real secret key)
//   npm start
//
// Deploy anywhere that runs Node (Render, Railway, Fly.io, a small VPS, etc).
// Point API_BASE_URL in the booking page's <script> to wherever this ends up.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Lock this down to your real domain before going live, e.g.:
// app.use(cors({ origin: 'https://lnblimousineservices.com' }));
app.use(cors());
app.use(express.json());

// Simple in-memory guard against absurd amounts hitting your endpoint.
// Adjust the ceiling to whatever your most expensive fare could realistically be.
const MIN_AMOUNT_CENTS = 1000;   // $10.00
const MAX_AMOUNT_CENTS = 100000; // $1,000.00

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', metadata = {} } = req.body;

    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount < MIN_AMOUNT_CENTS ||
      amount > MAX_AMOUNT_CENTS
    ) {
      return res.status(400).json({ error: 'Invalid fare amount.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // amount in cents, e.g. 7200 = $72.00
      currency,
      automatic_payment_methods: { enabled: true },
      metadata, // route, vehicle, date/time, flight number — shows up in the Stripe Dashboard
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Could not start payment session.' });
  }
});

// Optional but recommended: a webhook endpoint so you have a server-side
// record of successful charges even if the browser tab closes before the
// booking page can show the confirmation screen.
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    // TODO: write this booking to your database, send a confirmation
    // email/SMS, notify dispatch, etc.
    console.log('Payment succeeded for booking:', intent.metadata);
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`L&B Limousine Stripe backend running on port ${PORT}`));
