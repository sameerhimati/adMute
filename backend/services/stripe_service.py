import stripe
from flask import current_app

def init_stripe():
    stripe.api_key = current_app.config['STRIPE_SECRET_KEY']

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