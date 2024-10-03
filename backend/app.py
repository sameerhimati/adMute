from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from services.stripe_service import init_stripe
from utils.error_handlers import register_error_handlers

db = SQLAlchemy()
migrate = Migrate()
bcrypt = Bcrypt()
jwt = JWTManager()

def create_app(config_name='development'):
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(f'config.{config_name.capitalize()}Config')
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    jwt.init_app(app)
    
    # Initialize Stripe
    with app.app_context():
        init_stripe()
    
    # Register blueprints
    from routes.auth import auth_bp
    from routes.subscription import subscription_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(subscription_bp, url_prefix='/subscription')
    
    # Register error handlers
    register_error_handlers(app)
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)