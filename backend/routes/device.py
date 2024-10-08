from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import User, Device, Subscription
from app import db
from datetime import datetime
from werkzeug.exceptions import BadRequest, NotFound

device_bp = Blueprint('device', __name__)

@device_bp.route('/register', methods=['POST'])
@jwt_required()
def register_device():
    try:
        current_user_id = get_jwt_identity()
        current_app.logger.info(f"Attempting to register device for user: {current_user_id}")
        
        user = db.session.get(User, current_user_id)
        
        if not user:
            current_app.logger.warning(f"User not found for ID: {current_user_id}")
            raise NotFound('User not found')
        
        if not user.subscription or user.subscription.status != 'active':
            current_app.logger.warning(f"No active subscription for user: {current_user_id}")
            raise BadRequest('Active subscription required')

        data = request.get_json()
        device_id = data.get('device_id')
        device_name = data.get('device_name', 'Unknown Device')

        if not device_id:
            current_app.logger.warning("No device_id provided in request")
            raise BadRequest('Device ID is required')

        existing_device = Device.query.filter_by(device_id=device_id).first()
        if existing_device:
            current_app.logger.warning(f"Device already registered: {device_id}")
            raise BadRequest('Device already registered')

        device_count = Device.query.filter_by(user_id=current_user_id).count()
        if device_count >= user.subscription.device_limit:
            current_app.logger.warning(f"Device limit reached for user: {current_user_id}")
            raise BadRequest('Device limit reached')

        new_device = Device(user_id=current_user_id, device_id=device_id, name=device_name)
        db.session.add(new_device)
        db.session.commit()

        current_app.logger.info(f"Device registered successfully: {device_id} for user: {current_user_id}")
        return jsonify({'message': 'Device registered successfully'}), 201
    except (BadRequest, NotFound) as e:
        current_app.logger.warning(f"Client error in register_device: {str(e)}")
        return jsonify({'error': str(e)}), e.code
    except Exception as e:
        current_app.logger.error(f'Unexpected error in register_device: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500
    

@device_bp.route('/list', methods=['GET'])
@jwt_required()
def get_devices():
    try:
        current_user_id = get_jwt_identity()
        user = db.session.get(User, current_user_id)
        
        if not user:
            raise NotFound('User not found')

        devices = Device.query.filter_by(user_id=current_user_id).all()
        
        return jsonify({
            'devices': [{'id': d.id, 'name': d.name, 'last_active': d.last_active.isoformat() if d.last_active else None} for d in devices],
            'device_limit': user.subscription.device_limit if user.subscription else 0
        }), 200
    except NotFound as e:
        current_app.logger.warning(f"Client error in get_devices: {str(e)}")
        return jsonify({'error': str(e)}), e.code
    except Exception as e:
        current_app.logger.error(f'Error in get_devices: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500

@device_bp.route('/remove/<int:device_id>', methods=['DELETE'])
@jwt_required()
def remove_device(device_id):
    try:
        current_user_id = get_jwt_identity()
        device = Device.query.filter_by(id=device_id, user_id=current_user_id).first()
        
        if not device:
            raise NotFound('Device not found')

        db.session.delete(device)
        db.session.commit()

        return jsonify({'message': 'Device removed successfully'}), 200
    except NotFound as e:
        current_app.logger.warning(f"Client error in remove_device: {str(e)}")
        return jsonify({'error': str(e)}), e.code
    except Exception as e:
        current_app.logger.error(f'Error in remove_device: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500

@device_bp.route('/update-activity/<int:device_id>', methods=['POST'])
@jwt_required()
def update_device_activity(device_id):
    try:
        current_user_id = get_jwt_identity()
        device = Device.query.filter_by(id=device_id, user_id=current_user_id).first()
        
        if not device:
            raise NotFound('Device not found')

        device.last_active = datetime.utcnow()
        db.session.commit()

        return jsonify({'message': 'Device activity updated'}), 200
    except NotFound as e:
        current_app.logger.warning(f"Client error in update_device_activity: {str(e)}")
        return jsonify({'error': str(e)}), e.code
    except Exception as e:
        current_app.logger.error(f'Error in update_device_activity: {str(e)}')
        return jsonify({'error': 'An unexpected error occurred'}), 500