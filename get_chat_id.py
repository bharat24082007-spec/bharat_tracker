import json
import os
from tracker.common import request

# Print chat IDs from messages sent to the bot, without printing its token.
def main():
    try:
        data = json.loads(request('https://api.telegram.org/bot' + os.environ['TELEGRAM_BOT_TOKEN'] + '/getUpdates'))
        if not data.get('ok'):
            raise ValueError()
        ids = {x['message']['chat']['id'] for x in data['result'] if 'message' in x}
        print('\n'.join(map(str, ids)) if ids else 'Send your bot /start, then run again. Existing webhooks prevent getUpdates.')
    except Exception:
        raise SystemExit('Cannot read updates. Check TELEGRAM_BOT_TOKEN, network, and whether a webhook is active.') from None

if __name__ == '__main__':
    main()
