import json
import os
from .common import request

# Send one Telegram message without logging the token or request URL.
def send(text):
    try:
        result = json.loads(request('https://api.telegram.org/bot' + os.environ['TELEGRAM_BOT_TOKEN'] + '/sendMessage',
                                    {'chat_id': os.environ['TELEGRAM_CHAT_ID'], 'text': text[:4000]}))
        if not result.get('ok'):
            raise ValueError('Telegram rejected message')
    except Exception:
        raise RuntimeError('Telegram failed; check token, chat ID, and connectivity') from None
