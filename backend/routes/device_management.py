from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, Device, Subscription
from app import db

device_bp = Blueprint('device', __name__)

@device_bp.route('/register', methods=['POST'])
@jwt_required()
def register_device():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if not user.subscription or user.subscription.status != 'active':
        return jsonify({'message': 'Active subscription required'}), 403

    data = request.get_json()
    device_id = data.get('device_id')
    device_name = data.get('device_name', 'Unknown Device')

    existing_device = Device.query.filter_by(device_id=device_id).first()
    if existing_device:
        return jsonify({'message': 'Device already registered'}), 400

    device_count = Device.query.filter_by(user_id=current_user_id).count()
    if device_count >= user.subscription.device_limit:
        return jsonify({'message': 'Device limit reached'}), 403

    new_device = Device(user_id=current_user_id, device_id=device_id, name=device_name)
    db.session.add(new_device)
    db.session.commit()

    return jsonify({'message': 'Device registered successfully'}), 201

@device_bp.route('/devices', methods=['GET'])
@jwt_required()
def get_devices():
    current_user_id = get_jwt_identity()
    devices = Device.query.filter_by(user_id=current_user_id).all()
    return jsonify({
        'devices': [{'id': d.id, 'name': d.name, 'last_active': d.last_active} for d in devices],
        'device_limit': User.query.get(current_user_id).subscription.device_limit
    }), 200

@device_bp.route('/devices/<int:device_id>', methods=['DELETE'])
@jwt_required()
def remove_device(device_id):
    current_user_id = get_jwt_identity()
    device = Device.query.filter_by(id=device_id, user_id=current_user_id).first()
    
    if not device:
        return jsonify({'message': 'Device not found'}), 404

    db.session.delete(device)
    db.session.commit()

    return jsonify({'message': 'Device removed successfully'}), 200