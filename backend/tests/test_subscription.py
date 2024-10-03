import unittest
import stripe
from app import create_app, db
from models import User, Subscription
from flask_jwt_extended import create_access_token

class SubscriptionTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app('testing')
        self.app.config['JWT_SECRET_KEY'] = 'test-jwt-secret-key'
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()
        stripe.api_key = self.app.config['STRIPE_SECRET_KEY']

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def create_user(self):
        user = User(username='testuser', email='test@example.com')
        user.set_password('password')
        db.session.add(user)
        db.session.commit()
        return user

    def create_payment_method(self):
        return stripe.PaymentMethod.create(
            type="card",
            card={
                "number": "4242424242424242",
                "exp_month": 12,
                "exp_year": 2025,
                "cvc": "123",
            },
        )

    def test_subscribe(self):
        user = self.create_user()
        access_token = create_access_token(identity=user.id)

        payment_method = self.create_payment_method()

        response = self.client.post(
            '/subscription/subscribe',
            json={'plan': 'monthly', 'payment_method_id': payment_method.id},
            headers={'Authorization': f'Bearer {access_token}'}
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn('Subscription created successfully', response.get_json()['message'])

        user = User.query.filter_by(username='testuser').first()
        self.assertIsNotNone(user.subscription)
        self.assertEqual(user.subscription.status, 'active')
        self.assertEqual(user.subscription.plan, 'monthly')

        # Clean up: Cancel the subscription in Stripe
        stripe.Subscription.delete(user.subscription.stripe_subscription_id)

    def test_cancel_subscription(self):
        user = self.create_user()
        payment_method = self.create_payment_method()

        # Create a subscription directly with Stripe
        customer = stripe.Customer.create(email=user.email)
        stripe.PaymentMethod.attach(payment_method.id, customer=customer.id)
        stripe_subscription = stripe.Subscription.create(
            customer=customer.id,
            items=[{'price': self.app.config['MONTHLY_PRICE_ID']}],
            default_payment_method=payment_method.id,
        )

        subscription = Subscription(
            user_id=user.id,
            plan='monthly',
            status='active',
            stripe_customer_id=customer.id,
            stripe_subscription_id=stripe_subscription.id
        )
        db.session.add(subscription)
        db.session.commit()

        access_token = create_access_token(identity=user.id)

        response = self.client.post(
            '/subscription/cancel',
            headers={'Authorization': f'Bearer {access_token}'}
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('Subscription cancelled successfully', response.get_json()['message'])

        user = User.query.filter_by(username='testuser').first()
        self.assertEqual(user.subscription.status, 'cancelled')

        # Verify in Stripe
        stripe_sub = stripe.Subscription.retrieve(stripe_subscription.id)
        self.assertEqual(stripe_sub.status, 'canceled')

    def test_webhook(self):
        # Create a test event
        event = stripe.Event.construct_from({
            'id': 'evt_test_webhook',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_test_123',
                    'metadata': {'subscription': 'sub_test_123'}
                }
            }
        }, stripe.api_key)

        # Assuming your webhook endpoint expects a raw payload
        response = self.client.post(
            '/subscription/webhook',
            data=event.to_dict(),
            headers={'Stripe-Signature': 'test_signature'}
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])

if __name__ == '__main__':
    unittest.main()