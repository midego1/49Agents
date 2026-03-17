import crypto from 'node:crypto';
import { config } from '../config.js';
import { requireAuth } from '../auth/middleware.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/index.js';

const CHECKOUT_BASE_URL =
  'https://49agents.lemonsqueezy.com/checkout/buy/9481d5b8-f2b4-4f10-9a48-a67839f5d4cc';

function updateLemonSubscriptionId(userId, subscriptionId) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET lemon_subscription_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(subscriptionId, userId);
}

function updateLemonPortalUrl(userId, portalUrl) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET lemon_portal_url = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(portalUrl, userId);
}

function updateUserTier(userId, tier) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(tier, userId);
}

function getUserByLemonSubscriptionId(subscriptionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE lemon_subscription_id = ?').get(String(subscriptionId)) || null;
}

export function setupBillingRoutes(app) {

  // GET /api/billing/checkout — Return LemonSqueezy checkout URL with user context
  app.get('/api/billing/checkout', requireAuth, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.tier === 'pro') {
      return res.status(400).json({ error: 'Already on Pro plan' });
    }

    const params = new URLSearchParams();
    params.set('checkout[custom][user_id]', user.id);
    if (user.email) {
      params.set('checkout[email]', user.email);
    }

    const checkoutUrl = `${CHECKOUT_BASE_URL}?${params.toString()}`;
    res.json({ checkoutUrl });
  });

  // GET /api/billing/portal — Return stored LemonSqueezy customer portal URL
  app.get('/api/billing/portal', requireAuth, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.lemon_portal_url) {
      return res.json({ portalUrl: user.lemon_portal_url });
    }

    res.status(400).json({
      error: 'No billing portal available. Portal URL is provided after your first subscription payment.',
    });
  });

  // GET /api/billing/status — Return billing status for current user
  app.get('/api/billing/status', requireAuth, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    res.json({
      tier: user.tier || 'free',
      hasSubscription: !!user.lemon_subscription_id,
      billingConfigured: !!config.lemon.webhookSecret,
    });
  });
}

export function handleLemonWebhook(req, res) {
  const webhookSecret = config.lemon.webhookSecret;

  if (!webhookSecret) {
    console.error('[billing] LEMONSQUEEZY_WEBHOOK_SECRET not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const hmac = crypto.createHmac('sha256', webhookSecret);
  const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
  const signature = Buffer.from(req.headers['x-signature'] || '', 'utf8');

  if (digest.length !== signature.length || !crypto.timingSafeEqual(digest, signature)) {
    console.error('[billing] Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (e) {
    console.error('[billing] Failed to parse webhook body:', e.message);
    return res.status(400).send('Invalid JSON');
  }

  const eventName = payload.meta?.event_name;
  console.log(`[billing] Webhook: ${eventName}`);

  try {
    switch (eventName) {
      case 'subscription_created': {
        const userId = payload.meta?.custom_data?.user_id;
        if (!userId) {
          console.error('[billing] subscription_created missing user_id in custom_data');
          break;
        }
        const user = getUserById(userId);
        if (!user) {
          console.error(`[billing] subscription_created: user ${userId} not found`);
          break;
        }
        updateUserTier(userId, 'pro');
        updateLemonSubscriptionId(userId, String(payload.data.id));
        const portalUrl = payload.data?.attributes?.urls?.customer_portal;
        if (portalUrl) {
          updateLemonPortalUrl(userId, portalUrl);
        }
        console.log(`[billing] User ${userId} upgraded to pro`);
        break;
      }

      case 'subscription_updated': {
        const subscriptionId = String(payload.data.id);
        const user = getUserByLemonSubscriptionId(subscriptionId);
        if (!user) {
          console.error(`[billing] subscription_updated: no user for subscription ${subscriptionId}`);
          break;
        }
        const status = payload.data?.attributes?.status;
        if (status === 'active' || status === 'on_trial') {
          updateUserTier(user.id, 'pro');
        } else if (['cancelled', 'expired', 'past_due', 'unpaid'].includes(status)) {
          updateUserTier(user.id, 'free');
        }
        const portalUrl = payload.data?.attributes?.urls?.customer_portal;
        if (portalUrl) {
          updateLemonPortalUrl(user.id, portalUrl);
        }
        break;
      }

      case 'subscription_cancelled': {
        const subscriptionId = String(payload.data.id);
        const user = getUserByLemonSubscriptionId(subscriptionId);
        if (!user) {
          console.error(`[billing] subscription_cancelled: no user for subscription ${subscriptionId}`);
          break;
        }
        updateUserTier(user.id, 'free');
        updateLemonSubscriptionId(user.id, null);
        console.log(`[billing] User ${user.id} downgraded to free`);
        break;
      }
    }
  } catch (e) {
    console.error(`[billing] Webhook handler error (${eventName}):`, e);
  }

  res.status(200).json({ received: true });
}
