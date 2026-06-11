import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db.client import get_supabase
from config import settings
from typing import Dict, Any
import logging

# Configure logger
logger = logging.getLogger("auth")
logging.basicConfig(level=logging.INFO)

# JWT Bearer scheme to extract Authorization header
security = HTTPBearer()

# Instantiate the JWK client with caching enabled
_jwk_client: PyJWKClient = None

def get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        if not settings.SUPABASE_JWKS_URL:
            raise ValueError("SUPABASE_JWKS_URL is not configured in the environment.")
        _jwk_client = PyJWKClient(settings.SUPABASE_JWKS_URL)
    return _jwk_client

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    token = credentials.credentials
    
    # 1. Log token header details
    try:
        header = jwt.get_unverified_header(token)
        logger.info(f"Unverified token header: {header}")
    except Exception as e:
        logger.exception("Failed to parse token header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token format."
        )
        
    alg = header.get("alg")
    payload = None
    
    try:
        if alg == "HS256":
            # Symmetric verification using JWT Secret
            if not settings.SUPABASE_JWT_SECRET:
                logger.error("Token uses HS256 algorithm but SUPABASE_JWT_SECRET is not configured.")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Symmetric JWT secret is not configured for HS256 validation."
                )
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated"
            )
        elif alg in ("RS256", "ES256"):
            # Asymmetric verification using JWKS
            jwk_client = get_jwk_client()
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience="authenticated"
            )
        else:
            logger.error(f"Unsupported algorithm '{alg}' in token header.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unsupported token signature algorithm: {alg}"
            )
    except jwt.ExpiredSignatureError as e:
        logger.warning("Token expired signature error during validation.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again."
        )
    except jwt.InvalidAudienceError as e:
        logger.exception("Audience mismatch error during token validation.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Audience verification failed. Expected 'authenticated'."
        )
    except Exception as e:
        logger.exception("JWT verification failed with exception:")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed authentication token."
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User identifier missing from credentials."
        )

    # Load profile details from database
    try:
        supabase = get_supabase()
        res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
        profile = res.data
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No profile found for this user"
            )
        return profile
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.exception(f"Database error loading profile for user {user_id}:")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No profile found for this user"
        )

async def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required to perform this action."
        )
    return current_user
