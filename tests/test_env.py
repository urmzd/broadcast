from broadcast.core.env import mask, parse_env, parse_tokens, serialize_env


def test_parse_handles_export_quotes_and_comments():
    text = """
    # a comment
    export X_ACCESS_TOKEN="abc123"
    LINKEDIN_PERSON_URN=urn:li:person:xyz
    OPENAI_API_KEY='sk-secret'
    """
    parsed = parse_env(text)
    assert parsed == {
        "X_ACCESS_TOKEN": "abc123",
        "LINKEDIN_PERSON_URN": "urn:li:person:xyz",
        "OPENAI_API_KEY": "sk-secret",
    }


def test_serialize_roundtrips():
    secrets = {"X_CLIENT_ID": "cid", "X_ACCESS_TOKEN": "tok"}
    assert parse_env(serialize_env(secrets)) == secrets


def test_parse_tokens_filters_placeholders_and_scope():
    out = "\n".join(
        [
            "export X_ACCESS_TOKEN=fresh-access",
            "export X_REFRESH_TOKEN=fresh-refresh",
            "export OTHER=ignored",
        ]
    )
    assert parse_tokens(out, {"X_ACCESS_TOKEN", "X_REFRESH_TOKEN"}) == {
        "X_ACCESS_TOKEN": "fresh-access",
        "X_REFRESH_TOKEN": "fresh-refresh",
    }
    bad = "export LINKEDIN_PERSON_URN=(userinfo failed — set manually)"
    assert parse_tokens(bad, {"LINKEDIN_PERSON_URN"}) == {}


def test_mask():
    assert mask("") == "(empty)"
    assert mask("short") == "•••••"
    assert mask("abcdefghij") == "abc…ij"
