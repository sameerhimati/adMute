import unittest
import json
from app import create_app, db
from models import User

class AuthTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app('testing')
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_registration(self):
        response = self.client.post('/auth/register', json={
            'username': 'testuser',
            'email': 'testuser@example.com',
            'password': 'testpassword'
        })
        self.assertEqual(response.status_code, 201)
        self.assertIn('User registered successfully', response.get_json()['message'])

    def test_login(self):
        # First, register a user
        self.client.post('/auth/register', json={
            'username': 'testuser',
            'email': 'testuser@example.com',
            'password': 'testpassword'
        })

        # Then, try to log in
        response = self.client.post('/auth/login', json={
            'username': 'testuser',
            'password': 'testpassword'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access_token', response.get_json())

    def test_protected_route(self):
        # First, register and log in a user
        self.client.post('/auth/register', json={
            'username': 'testuser',
            'email': 'testuser@example.com',
            'password': 'testpassword'
        })
        login_response = self.client.post('/auth/login', json={
            'username': 'testuser',
            'password': 'testpassword'
        })
        access_token = login_response.get_json()['access_token']

        # Then, try to access the protected route
        response = self.client.get('/auth/protected', headers={
            'Authorization': f'Bearer {access_token}'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('logged_in_as', response.get_json())

if __name__ == '__main__':
    unittest.main()