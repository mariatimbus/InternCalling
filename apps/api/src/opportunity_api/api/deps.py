"""Shared FastAPI dependencies."""

from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.errors import APIError
from ..core.security import decode_supabase_token
from ..models import Profile, User

# Bearer tokens are issued by Supabase Auth, not by a backend login endpoint.
bearer_scheme = HTTPBearer(auto_error=False)

UnauthorizedError = APIError(
    "Not authenticated",
    status_code=status.HTTP_401_UNAUTHORIZED,
    code="unauthorized",
)


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if creds is None:
        raise UnauthorizedError
    try:
        claims = decode_supabase_token(creds.credentials)
        user_id = UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise UnauthorizedError from exc

    user = db.get(User, user_id)
    if user is None:
        # First sight of this Supabase user — mirror the row locally. On a
        # first-request race another worker may have inserted the row already;
        # the rollback expires all state, so re-fetch a fresh instance.
        metadata = claims.get("user_metadata") or {}
        email = claims.get("email") or metadata.get("email") or ""
        user = User(id=user_id, email=email, full_name=metadata.get("full_name") or "")
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            user = db.get(User, user_id)
            if user is None:
                raise
    if not user.is_active:
        raise APIError(
            "Account is deactivated",
            status_code=status.HTTP_403_FORBIDDEN,
            code="account_disabled",
        )
    get_or_create_profile(db, user)
    db.commit()
    return user


def get_or_create_profile(db: Session, user: User) -> Profile:
    """Return the user's profile, creating an empty row on first use (bootstrap).

    A new user's first page load issues parallel requests; if another request created
    the profile first, the unique ``user_id`` rejects ours. The insert runs in a
    savepoint so only it is undone, and the winner's row is returned instead of a 500.
    """
    if user.profile is not None:
        return user.profile
    profile = Profile(user_id=user.id)
    try:
        with db.begin_nested():
            db.add(profile)
            db.flush()
    except IntegrityError:
        existing = db.scalar(select(Profile).where(Profile.user_id == user.id))
        if existing is None:
            raise
        db.expire(user, ["profile"])
        return existing
    db.expire(user, ["profile"])
    return profile


def require_reviewer(
    user: Annotated[User, Depends(get_current_user)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """A user whose Supabase ``app_metadata.roles`` lists ``reviewer``.

    ``app_metadata`` can only be set with the server key, unlike ``user_metadata``,
    which every user can edit, so the claim cannot be self-granted.
    """
    claims = decode_supabase_token(creds.credentials)  # already verified by get_current_user
    roles = (claims.get("app_metadata") or {}).get("roles")
    if not isinstance(roles, list) or "reviewer" not in roles:
        raise APIError(
            "Reviewer access required", status_code=status.HTTP_403_FORBIDDEN, code="forbidden"
        )
    return user
