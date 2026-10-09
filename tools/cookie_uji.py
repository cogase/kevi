"""Cookie sesi untuk instans uji Agent Pak (rahasia acak sekali pakai dari tools/panggang.sh)."""
import sys
import time

import jwt

kini = int(time.time())
print(jwt.encode({"sub": "pemanggang", "iat": kini, "exp": kini + 600}, sys.argv[1], algorithm="HS256"))
