from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, Subscription, Device
from app import db
from services.stripe_service import create_customer, create_subscription, cancel_subscription as stripe_cancel_subscription, construct_event, attach_payment_method
from werkzeug.exceptions import BadRequest, NotFound, InternalServerError
from stripe.error import StripeError, SignatureVerificationError
from datetime import datetime

subscription_bp = Blueprint('subscription', __name__)

@subscription_bp.route('/subscribe', methods=['POST'])
@jwt_required()
def subscribe():
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user:
            raise NotFound('User not found')
        
        if user.subscription:
            raise BadRequest('User already has a subscription')
        
        data = request.get_json()
        plan = data.get('plan')
        payment_method_id = data.get('payment_method_id')
        
        if not payment_method_id:
            raise BadRequest('Payment method is required')
        
        if plan not in ['basic_monthly', 'basic_yearly', 'premium_monthly', 'premium_yearly']:
            raise BadRequest('Invalid plan')
        
        stripe_customer = create_customer(user.email)
        
        # Attach the payment method to the customer
        attach_payment_method(stripe_customer.id, payment_method_id)
        
        if plan in ['basic_monthly', 'basic_yearly']:
            price_id = current_app.config['BASIC_MONTHLY_PRICE_ID' if plan == 'basic_monthly' else 'BASIC_YEARLY_PRICE_ID']
            device_limit = 1
        else:
            price_id = current_app.config['PREMIUM_MONTHLY_PRICE_ID' if plan == 'premium_monthly' else 'PREMIUM_YEARLY_PRICE_ID']
            device_limit = 5

        stripe_subscription = create_subscription(stripe_customer.id, price_id, payment_method_id)
        
        subscription = Subscription(
            user_id=user.id,
            plan=plan,
            status='active',
            device_limit=device_limit,
            stripe_customer_id=stripe_customer.id,
            stripe_subscription_id=stripe_subscription.id,
            current_period_end=datetime.fromtimestamp(stripe_subscription.current_period_end)
        )
        db.session.add(subscription)
        db.session.commit()
        
        return jsonify({'message': 'Subscription created successfully'}), 201
    except (BadRequest, NotFound) as e:
        current_app.logger.warning(f"Client error in subscribe: {str(e)}")
        return jsonify({'error': str(e)}), e.code
    except Exception as e:
        current_app.logger.error(f'Error in subscribe: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500
    
from flask import jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, Device
from sqlalchemy.orm.exc import NoResultFound
from werkzeug.exceptions import NotFound
from app import db

@subscription_bp.route('/subscription', methods=['GET'])
@jwt_required()
def get_subscription():
    current_app.logger.info('Subscription route accessed')
    try:
        current_user_id = get_jwt_identity()
        current_app.logger.info(f'User ID: {current_user_id}')
        
        user = db.session.get(User, current_user_id)
        if not user:
            current_app.logger.warning(f'User not found: {current_user_id}')
            raise NotFound('User not found')
        
        if not user.subscription:
            current_app.logger.info(f'No active subscription for user: {current_user_id}')
            raise NotFound('No active subscription')
        
        subscription = user.subscription
        devices = Device.query.filter_by(user_id=current_user_id).count()
        
        response_data = {
            'plan': subscription.plan,
            'status': subscription.status,
            'device_limit': subscription.device_limit,
            'devices_used': devices,
            'current_period_end': subscription.current_period_end.isoformat() if subscription.current_period_end else None
        }
        
        current_app.logger.info(f'Subscription data: {response_data}')
        return jsonify(response_data), 200
    
    except NotFound as e:
        current_app.logger.warning(f'NotFound error in get_subscription: {str(e)}')
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        current_app.logger.error(f'Unexpected error in get_subscription: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500

@subscription_bp.route('/cancel', methods=['POST'])
@jwt_required()
def cancel_subscription():
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user:
            raise NotFound('User not found')
        
        if not user.subscription:
            raise NotFound('No active subscription to cancel')
        
        stripe_subscription = stripe_cancel_subscription(user.subscription.stripe_subscription_id)
        
        user.subscription.status = 'cancelled'
        user.subscription.current_period_end = stripe_subscription.current_period_end
        db.session.commit()
        
        return jsonify({'message': 'Subscription cancelled successfully'}), 200
    except NotFound as e:
        current_app.logger.warning(f"Client error in cancel_subscription: {str(e)}")
        return jsonify({'error': str(e)}), e.code
    except StripeError as e:
        current_app.logger.error(f"Stripe error in cancel_subscription: {str(e)}")
        return jsonify({'error': 'An error occurred while cancelling your subscription'}), 500
    except Exception as e:
        current_app.logger.error(f'Unexpected error in cancel_subscription: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500

@subscription_bp.route('/webhook', methods=['POST'])
def webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')

    try:
        event = construct_event(payload, sig_header, current_app.config['STRIPE_WEBHOOK_SECRET'])

        # Handle the event
        if event['type'] == 'payment_intent.succeeded':
            payment_intent = event['data']['object']
            handle_payment_succeeded(payment_intent)
        elif event['type'] == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            handle_payment_failed(payment_intent)
        elif event['type'] == 'customer.subscription.deleted':
            subscription = event['data']['object']
            handle_subscription_deleted(subscription)
        elif event['type'] == 'customer.subscription.updated':
            subscription = event['data']['object']
            handle_subscription_updated(subscription)
        elif event['type'] == 'invoice.payment_succeeded':
            invoice = event['data']['object']
            handle_invoice_paid(invoice)
        elif event['type'] == 'invoice.payment_failed':
            invoice = event['data']['object']
            handle_invoice_failed(invoice)
        else:
            current_app.logger.info(f"Unhandled event type: {event['type']}")

        return jsonify(success=True), 200
    except ValueError as e:
        current_app.logger.error(f"Invalid payload: {str(e)}")
        return jsonify(error=str(e)), 400
    except SignatureVerificationError as e:
        current_app.logger.error(f"Invalid signature: {str(e)}")
        return jsonify(error=str(e)), 400
    except Exception as e:
        current_app.logger.error(f'Error in webhook: {str(e)}')
        return jsonify(error='An unexpected error occurred'), 500

def handle_payment_succeeded(payment_intent):
    current_app.logger.info(f"Payment succeeded for PaymentIntent: {payment_intent['id']}")
    # Find the subscription associated with this payment
    if 'subscription' in payment_intent['metadata']:
        subscription_id = payment_intent['metadata']['subscription']
        subscription = Subscription.query.filter_by(stripe_subscription_id=subscription_id).first()
        if subscription:
            subscription.status = 'active'
            db.session.commit()
            current_app.logger.info(f"Subscription {subscription_id} activated")
        else:
            current_app.logger.warning(f"No subscription found for PaymentIntent: {payment_intent['id']}")
    else:
        current_app.logger.info(f"PaymentIntent {payment_intent['id']} not associated with a subscription")

def handle_payment_failed(payment_intent):
    current_app.logger.info(f"Payment failed for PaymentIntent: {payment_intent['id']}")
    # Find the subscription associated with this payment
    if 'subscription' in payment_intent['metadata']:
        subscription_id = payment_intent['metadata']['subscription']
        subscription = Subscription.query.filter_by(stripe_subscription_id=subscription_id).first()
        if subscription:
            subscription.status = 'past_due'
            db.session.commit()
            current_app.logger.info(f"Updated subscription {subscription_id} to past_due status")
        else:
            current_app.logger.warning(f"No subscription found for PaymentIntent: {payment_intent['id']}")
    else:
        current_app.logger.info(f"PaymentIntent {payment_intent['id']} not associated with a subscription")

def handle_subscription_updated(subscription):
    db_subscription = Subscription.query.filter_by(stripe_subscription_id=subscription.id).first()
    if db_subscription:
        db_subscription.status = subscription.status
        db_subscription.current_period_end = datetime.fromtimestamp(subscription.current_period_end)
        db.session.commit()
        current_app.logger.info(f"Subscription {db_subscription.id} updated")
    else:
        current_app.logger.warning(f"No subscription found in database for Stripe subscription: {subscription.id}")

def handle_invoice_paid(invoice):
    subscription_id = invoice.subscription
    subscription = Subscription.query.filter_by(stripe_subscription_id=subscription_id).first()
    if subscription:
        subscription.status = 'active'
        subscription.current_period_end = datetime.fromtimestamp(invoice.lines.data[0].period.end)
        db.session.commit()
        current_app.logger.info(f"Subscription {subscription_id} renewed")
    else:
        current_app.logger.warning(f"No subscription found for invoice: {invoice.id}")

def handle_invoice_failed(invoice):
    subscription_id = invoice.subscription
    subscription = Subscription.query.filter_by(stripe_subscription_id=subscription_id).first()
    if subscription:
        subscription.status = 'past_due'
        db.session.commit()
        current_app.logger.info(f"Subscription {subscription_id} marked as past due")
        # TODO: Implement user notification for failed payment
    else:
        current_app.logger.warning(f"No subscription found for invoice: {invoice.id}")

def handle_subscription_deleted(subscription):
    current_app.logger.info(f"Subscription deleted: {subscription.id}")
    db_subscription = Subscription.query.filter_by(stripe_subscription_id=subscription.id).first()
    if db_subscription:
        db_subscription.status = 'cancelled'
        db.session.commit()
        current_app.logger.info(f"Subscription {db_subscription.id} marked as cancelled")
    else:
        current_app.logger.warning(f"No subscription found in database for Stripe subscription: {subscription.id}")