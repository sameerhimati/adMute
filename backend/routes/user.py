from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User
from app import db

user_bp = Blueprint('user', __name__)

@user_bp.route('/metrics', methods=['GET', 'POST'])
@jwt_required()
def user_metrics():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if request.method == 'POST':
        metrics = request.json
        user.total_muted_time = metrics.get('timeMuted', user.total_muted_time)
        user.total_ads_muted = metrics.get('adsMuted', user.total_ads_muted)
        
        db.session.commit()
        
        return jsonify({'message': 'User metrics updated successfully'}), 200
    else:  # GET request
        return jsonify({
            'total_muted_time': user.total_muted_time,
            'total_ads_muted': user.total_ads_muted
        }), 200