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
    ads_muted = db.Column(db.Integer, default=0)
    total_mute_duration = db.Column(db.Integer, default=0)  # in seconds
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'ip_address': self.ip_address,
            'ads_muted': self.ads_muted,
            'total_mute_duration': self.total_mute_duration,
            'last_updated': self.last_updated.isoformat()
        }

@app.route('/api/data', methods=['POST'])
def receive_data():
    # This route is kept for potential future use, but won't be called by the extension for now
    data = request.json
    # Process data here if needed
    return jsonify({'status': 'success'}), 200

def init_db():
    with app.app_context():
        db.create_all()

if __name__ == '__main__':
    init_db()
    app.run(debug=True)

print("Server is ready, but not connected to the extension.")