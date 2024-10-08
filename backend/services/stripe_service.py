import stripe
from flask import current_app, url_for

def init_stripe():
    stripe.api_key = current_app.config['STRIPE_SECRET_KEY']

def create_checkout_session(user_id, plan, success_token):
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
        success_url=url_for('subscription.subscription_success', _external=True) + f'?session_id={{CHECKOUT_SESSION_ID}}&success_token={success_token}',
        cancel_url=url_for('subscription.subscription_cancel', _external=True),
        client_reference_id=str(user_id),
        metadata={
            'plan': plan,
            'success_token': success_token
        }
    )
    return session

def retrieve_checkout_session(session_id):
    try:
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=['subscription']
        )
        return session
    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe error retrieving session: {str(e)}")
        raise
    except Exception as e:
        current_app.logger.error(f"Unexpected error retrieving session: {str(e)}")
        raise

def create_customer(email):
    return stripe.Customer.create(email=email)

def attach_payment_method(customer_id, payment_method_id):
    payment_method = stripe.PaymentMethod.attach(
        payment_method_id,
        customer=customer_id,
    )
    stripe.Customer.modify(
        customer_id,
        invoice_settings={
            'default_payment_method': payment_method.id
        }
    )
    return payment_method

def create_subscription(customer_id, price_id, payment_method_id):
    return stripe.Subscription.create(
        customer=customer_id,
        items=[{'price': price_id}],
        default_payment_method=payment_method_id,
    )

def cancel_subscription(subscription_id):
    return stripe.Subscription.delete(subscription_id)

def construct_event(payload, sig_header, webhook_secret):
    return stripe.Webhook.construct_event(payload, sig_header, webhook_secret)

def handle_payment_succeeded(payment_intent):
    # Update the subscription status to 'active' if it's not already
    subscription = stripe.Subscription.retrieve(payment_intent.subscription)
    # You would typically update your database here
    print(f"Payment succeeded for subscription: {subscription.id}")

def handle_payment_failed(payment_intent):
    # Update the subscription status to 'past_due'
    subscription = stripe.Subscription.retrieve(payment_intent.subscription)
    # You would typically update your database here
    print(f"Payment failed for subscription: {subscription.id}")