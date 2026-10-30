import os
import firebase_admin
from firebase_admin.credentials import Base
from google.oauth2.credentials import Credentials
from .run import main
from .store import database, read
from .common import now

class LocalCredential(Base):
    # Wrap the short-lived CLI access token for the existing Admin SDK storage code.
    def get_credential(self):
        return Credentials(os.environ['FIREBASE_LOCAL_ACCESS_TOKEN'])

if __name__ == '__main__':
    firebase_admin.initialize_app(LocalCredential(), {'projectId': os.environ['GOOGLE_CLOUD_PROJECT']})
    main()
