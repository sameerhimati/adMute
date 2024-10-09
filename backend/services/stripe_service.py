import stripe
from flask import current_app, url_for

def init_stripe():
    stripe.api_key = current_app.config['STRIPE_SECRET_KEY']

def create_checkout_session(user_id, plan):
    if plan in ['basic_monthly', 'basic_yearly']:
        price_id = current_app.config['BASIC_MONTHLY_PRICE_ID' if plan == 'basic_monthly' else 'BASIC_YEARLY_PRICE_ID']
    else:
        price_id = current_app.config['PREMIUM_MONTHLY_PRICE_ID' if plan == 'premium_monthly' else 'PREMIUM_YEARLY_PRICE_ID']

    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        line_items=[{
            'price': price_id,
            'quantity': 1,
        }],
        mode='subscription',
        success_url=url_for('subscription.subscription_success', _external=True) + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url=url_for('subscription.subscription_cancel', _external=True),
        client_reference_id=str(user_id),
        metadata={
            'plan': plan
        }
    )
    return session

def retrieve_checkout_session(session_id):
    try:
        return stripe.checkout.Session.retrieve(
            session_id,
            expand=['subscription', 'subscription.latest_invoice']
        )
    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe error retrieving session: {str(e)}")
        raise
    except Exception as e:
        current_app.logger.error(f"Unexpected error retrieving session: {str(e)}")
        raise

def cancel_subscription(subscription_id):
    return stripe.Subscription.delete(subscription_id)

def construct_event(payload, sig_header, webhook_secret):
    return stripe.Webhook.construct_event(payload, sig_header, webhook_secret)