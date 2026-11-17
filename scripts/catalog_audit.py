"""CLI entry point for the read-only public catalog release audit."""

from opportunity_api.ingestion.catalog_audit import main

if __name__ == "__main__":
    raise SystemExit(main())
