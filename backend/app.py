from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'postgresql://username:password@localhost/admuterdb')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class UserData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), nullable=False)
    ip_address = db.Column(db.String(50), nullable=False)
    feedback = db.Column(db.Text, nullable=True)
    ads_muted = db.Column(db.Integer, default=0)
    total_mute_duration = db.Column(db.Integer, default=0)  # in seconds
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'ip_address': self.ip_address,
            'feedback': self.feedback,
            'ads_muted': self.ads_muted,
            'total_mute_duration': self.total_mute_duration,
            'last_updated': self.last_updated.isoformat()
        }

@app.route('/api/data', methods=['POST'])
def receive_data():
    data = request.json
    user_data = UserData.query.filter_by(user_id=data['user_id']).first()
    
    if user_data:
        user_data.ip_address = request.remote_addr
        user_data.ads_muted = data['ads_muted']
        user_data.total_mute_duration = data['total_mute_duration']
        if 'feedback' in data and data['feedback']:
            user_data.feedback = data['feedback']
        user_data.last_updated = datetime.utcnow()
    else:
        user_data = UserData(
            user_id=data['user_id'],
            ip_address=request.remote_addr,
            ads_muted=data['ads_muted'],
            total_mute_duration=data['total_mute_duration'],
            feedback=data.get('feedback', None)
        )
        db.session.add(user_data)
    
    db.session.commit()
    return jsonify({'status': 'success'}), 200

if __name__ == '__main__':
    db.create_all()
    app.run(debug=True)