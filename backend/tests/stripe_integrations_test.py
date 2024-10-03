import unittest
from unittest.mock import patch, MagicMock
from app import create_app, db
from models import User, Subscription
from flask_jwt_extended import create_access_token

class StripeIntegrationTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app('testing')
        self.app.config['JWT_SECRET_KEY'] = 'test-jwt-secret-key'
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    @patch('services.stripe_service.stripe.Customer.create')
    @patch('services.stripe_service.stripe.PaymentMethod.attach')
    @patch('services.stripe_service.stripe.Customer.modify')
    @patch('services.stripe_service.stripe.Subscription.create')
    def test_create_subscription(self, mock_sub_create, mock_cust_modify, mock_pm_attach, mock_cust_create):
        # Create a test user
        user = User(username='testuser', email='test@example.com')
        user.set_password('password')
        db.session.add(user)
        db.session.commit()

        # Mock Stripe API responses
        mock_cust_create.return_value = MagicMock(id='cus_test123')
        mock_pm_attach.return_value = MagicMock(id='pm_test123')
        mock_sub_create.return_value = MagicMock(
            id='sub_test123',
            status='active',
            current_period_end=1609459200
        )

        # Create access token
        with self.app.app_context():
            access_token = create_access_token(identity=user.id)

        # Create a subscription
        response = self.client.post('/subscription/subscribe', 
                                    headers={'Authorization': f'Bearer {access_token}'},
                                    json={'plan': 'monthly', 'payment_method_id': 'pm_test123'})
        
        self.assertEqual(response.status_code, 201)
        self.assertIn('Subscription created successfully', response.get_json()['message'])

        # Check that the subscription was created in the database
        user = User.query.filter_by(username='testuser').first()
        self.assertIsNotNone(user.subscription)
        self.assertEqual(user.subscription.status, 'active')
        self.assertEqual(user.subscription.plan, 'monthly')

        # Verify Stripe API calls
        mock_cust_create.assert_called_once()
        mock_pm_attach.assert_called_once()
        mock_cust_modify.assert_called_once()
        mock_sub_create.assert_called_once()

if __name__ == '__main__':
    unittest.main()