from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User
from app import db

user_bp = Blueprint('user', __name__)

@user_bp.route('/metrics', methods=['POST'])
@jwt_required()
def update_user_metrics():
    try:
        current_user_id = get_jwt_identity()
        user = User.query.get(current_user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        metrics = request.json
        # Update user metrics here. You'll need to add appropriate fields to your User model.
        # For example:
        # user.total_muted_time = metrics.get('totalMutedTime', user.total_muted_time)
        # user.total_ads_muted = metrics.get('totalAdsMuted', user.total_ads_muted)
        
        db.session.commit()
        
        return jsonify({'message': 'User metrics updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500