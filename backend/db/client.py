from supabase import create_client, Client
from config import settings

_supabase: Client = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured in environment variables.")
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
    return _supabase
