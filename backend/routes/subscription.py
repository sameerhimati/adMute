from flask import Blueprint, request, jsonify, current_app, redirect, render_template, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, Subscription, Device
from app import db
from services.stripe_service import create_checkout_session, retrieve_checkout_session, cancel_subscription, construct_event
from werkzeug.exceptions import BadRequest, NotFound
from stripe.error import StripeError
from datetime import datetime

subscription_bp = Blueprint('subscription', __name__)

@subscription_bp.route('/create-checkout-session', methods=['POST'])
@jwt_required()
def create_stripe_checkout_session():
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.json
        plan = data.get('plan')
        
        if plan not in ['basic_monthly', 'basic_yearly', 'premium_monthly', 'premium_yearly']:
            return jsonify({'error': 'Invalid plan'}), 400
        
        session = create_checkout_session(user.id, plan)
        
        return jsonify({'sessionId': session.id, 'url': session.url})
    except Exception as e:
        current_app.logger.error(f'Error creating checkout session: {str(e)}')
        return jsonify({'error': 'Failed to create checkout session'}), 500

@subscription_bp.route('/subscription-success')
def subscription_success():
    session_id = request.args.get('session_id')
    
    if not session_id:
        current_app.logger.error('No session_id provided to subscription_success')
        return jsonify({'error': 'Invalid session ID'}), 400

    try:
        session = retrieve_checkout_session(session_id)
        
        user_id = int(session.client_reference_id)
        user = User.query.get(user_id)
        
        if not user:
            current_app.logger.error(f'User not found for id: {user_id}')
            return jsonify({'error': 'User not found'}), 404

        stripe_subscription = session.subscription
        plan = session.metadata.get('plan')
        device_limit = 5 if plan.startswith('premium') else 1

        subscription = Subscription(
            user_id=user.id,
            plan=plan,
            status=stripe_subscription.status,
            device_limit=device_limit,
            stripe_customer_id=session.customer,
            stripe_subscription_id=stripe_subscription.id,
            current_period_end=datetime.fromtimestamp(stripe_subscription.current_period_end)
        )
        db.session.add(subscription)
        db.session.commit()

        current_app.logger.info(f'Subscription created successfully for user: {user_id}')
        return render_template('subscription_success.html')
    except Exception as e:
        current_app.logger.error(f'Error processing subscription success: {str(e)}')
        return jsonify({'error': 'Failed to process subscription'}), 500

@subscription_bp.route('/subscription', methods=['GET'])
@jwt_required()
def get_subscription():
    try:
        current_user_id = get_jwt_identity()
        user = User.query.get(current_user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        subscription = Subscription.query.filter_by(user_id=current_user_id).first()
        
        if not subscription:
            return jsonify({
                'status': 'inactive',
                'message': 'No active subscription'
            }), 200
        
        return jsonify({
            'status': subscription.status,
            'plan': subscription.plan,
            'device_limit': subscription.device_limit,
            'current_period_end': subscription.current_period_end.isoformat() if subscription.current_period_end else None
        }), 200
    
    except Exception as e:
        print(f"Error in get_subscription: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred'}), 500

@subscription_bp.route('/cancel', methods=['POST'])
@jwt_required()
def cancel_subscription_route():
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user or not user.subscription:
            raise NotFound('No active subscription to cancel')
        
        stripe_subscription = cancel_subscription(user.subscription.stripe_subscription_id)
        
        user.subscription.status = stripe_subscription.status
        user.subscription.current_period_end = datetime.fromtimestamp(stripe_subscription.current_period_end)
        db.session.commit()
        
        return jsonify({'message': 'Subscription cancelled successfully'}), 200
    except NotFound as e:
        return jsonify({'error': str(e)}), 404
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

        if event['type'] == 'customer.subscription.updated':
            handle_subscription_updated(event['data']['object'])
        elif event['type'] == 'customer.subscription.deleted':
            handle_subscription_deleted(event['data']['object'])
        elif event['type'] == 'invoice.payment_succeeded':
            handle_invoice_paid(event['data']['object'])
        elif event['type'] == 'invoice.payment_failed':
            handle_invoice_failed(event['data']['object'])
        else:
            current_app.logger.info(f"Unhandled event type: {event['type']}")

        return jsonify(success=True), 200
    except Exception as e:
        current_app.logger.error(f'Error in webhook: {str(e)}')
        return jsonify(error='An unexpected error occurred'), 500

@subscription_bp.route('/subscription-cancel')
def subscription_cancel():
    return redirect(url_for('subscription.get_subscription'))

def handle_subscription_updated(stripe_subscription):
    subscription = Subscription.query.filter_by(stripe_subscription_id=stripe_subscription.id).first()
    if subscription:
        subscription.status = stripe_subscription.status
        subscription.current_period_end = datetime.fromtimestamp(stripe_subscription.current_period_end)
        db.session.commit()
        current_app.logger.info(f"Subscription {subscription.id} updated")
    else:
        current_app.logger.warning(f"No subscription found for Stripe subscription: {stripe_subscription.id}")

def handle_subscription_deleted(stripe_subscription):
    subscription = Subscription.query.filter_by(stripe_subscription_id=stripe_subscription.id).first()
    if subscription:
        subscription.status = 'cancelled'
        db.session.commit()
        current_app.logger.info(f"Subscription {subscription.id} marked as cancelled")
    else:
        current_app.logger.warning(f"No subscription found for Stripe subscription: {stripe_subscription.id}")

def handle_invoice_paid(invoice):
    subscription = Subscription.query.filter_by(stripe_subscription_id=invoice.subscription).first()
    if subscription:
        subscription.status = 'active'
        subscription.current_period_end = datetime.fromtimestamp(invoice.lines.data[0].period.end)
        db.session.commit()
        current_app.logger.info(f"Subscription {subscription.id} renewed")
    else:
        current_app.logger.warning(f"No subscription found for invoice: {invoice.id}")

def handle_invoice_failed(invoice):
    subscription = Subscription.query.filter_by(stripe_subscription_id=invoice.subscription).first()
    if subscription:
        subscription.status = 'past_due'
        db.session.commit()
        current_app.logger.info(f"Subscription {subscription.id} marked as past due")
    else:
        current_app.logger.warning(f"No subscription found for invoice: {invoice.id}")