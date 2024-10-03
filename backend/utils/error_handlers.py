from flask import jsonify
from werkzeug.exceptions import HTTPException

def register_error_handlers(app):
    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        response = jsonify({
            "error": {
                "code": error.code,
                "name": error.name,
                "description": error.description,
            }
        })
        response.status_code = error.code
        return response

    @app.errorhandler(Exception)
    def handle_generic_error(error):
        app.logger.error(f'An unexpected error occurred: {str(error)}')
        response = jsonify({
            "error": {
                "code": 500,
                "name": "Internal Server Error",
                "description": "An unexpected error occurred.",
            }
        })
        response.status_code = 500
        return response