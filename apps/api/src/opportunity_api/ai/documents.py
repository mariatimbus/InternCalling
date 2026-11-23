"""Bounded text-only PDF/DOCX parsing. No OCR, external entities or external links."""

from io import BytesIO
from zipfile import ZipFile

from defusedxml import ElementTree
from pypdf import PdfReader

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 40_000
PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class InvalidDocument(ValueError):
    pass


def _parse_text(data: bytes, media_type: str) -> str:
    if not data or len(data) > MAX_FILE_BYTES:
        raise InvalidDocument("Use a nonempty CV up to 5 MiB")
    try:
        if media_type == PDF and data.startswith(b"%PDF-"):
            reader = PdfReader(BytesIO(data), strict=True)
            if reader.is_encrypted or not 0 < len(reader.pages) <= 30:
                raise InvalidDocument("Use an unencrypted CV with at most 30 pages")
            parts = []
            for page in reader.pages:
                # Bound decompressed streams before the parser traverses page content.
                contents = page.get_contents()
                if contents is not None and len(contents.get_data()) > 2_000_000:
                    raise InvalidDocument("PDF page is too complex")
                parts.append(page.extract_text() or "")
                if sum(map(len, parts)) > MAX_TEXT_CHARS:
                    raise InvalidDocument("CV text is too long")
            text = "\n".join(parts)
        elif media_type == DOCX and data.startswith(b"PK"):
            with ZipFile(BytesIO(data)) as archive:
                entries = archive.infolist()
                if len(entries) > 200 or sum(item.file_size for item in entries) > 10_000_000:
                    raise InvalidDocument("DOCX archive is too large")
                if any(item.flag_bits & 1 for item in entries):
                    raise InvalidDocument("Encrypted DOCX files are not supported")
                xml = archive.read("word/document.xml")
                root = ElementTree.fromstring(xml, forbid_dtd=True)
                ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
                text = "\n".join("".join(node.itertext()) for node in root.iter(ns + "t"))
        else:
            raise InvalidDocument("Upload a PDF or DOCX with a matching content type")
    except InvalidDocument:
        raise
    except Exception as exc:
        raise InvalidDocument("CV could not be read safely") from exc
    # A font without a Unicode map turns letters such as "ș" into NUL, which Postgres
    # cannot store; drop them instead of rejecting the whole CV.
    text = text.replace("\x00", "")
    if not text.strip():
        raise InvalidDocument("No readable text found; upload a text-based PDF or DOCX")
    if len(text) > MAX_TEXT_CHARS:
        raise InvalidDocument("CV text is too long")
    return text.strip()


PARSER_MEMORY_BYTES = 512 * 1024 * 1024


def _mapped_bytes() -> int:
    """Current virtual memory size (Linux), used as the base for RLIMIT_AS."""
    try:
        with open("/proc/self/status") as status:
            for line in status:
                if line.startswith("VmSize:"):
                    return int(line.split()[1]) * 1024
    except OSError:
        pass
    return 0


def _start_method() -> str:
    """`fork` on Linux: `spawn` re-runs the host's __main__ (e.g. the Vercel launcher),
    so the child never answers in serverless runtimes. Elsewhere keep `spawn`."""
    import sys

    return "fork" if sys.platform.startswith("linux") else "spawn"


def _parse_worker(connection, data: bytes, media_type: str):
    try:
        import logging

        logging.disable(logging.CRITICAL)
        import resource
        import sys

        resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
        if sys.platform.startswith("linux"):
            # Budget on top of what the (forked) process already maps, so the cap limits
            # the parser without starving an interpreter that has the API loaded.
            limit = _mapped_bytes() + PARSER_MEMORY_BYTES
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        connection.send((True, _parse_text(data, media_type)))
    except InvalidDocument as exc:
        connection.send((False, str(exc)))
    except Exception:
        connection.send((False, "CV could not be read safely"))
    finally:
        connection.close()


def extract_text(data: bytes, media_type: str) -> str:
    """Run untrusted parsers in a disposable process with CPU/time/memory limits."""
    import multiprocessing

    if not data or len(data) > MAX_FILE_BYTES:
        raise InvalidDocument("Use a nonempty CV up to 5 MiB")
    context = multiprocessing.get_context(_start_method())
    reader, writer = context.Pipe(duplex=False)
    process = context.Process(target=_parse_worker, args=(writer, data, media_type))
    process.start()
    writer.close()
    try:
        if not reader.poll(10):
            raise InvalidDocument("CV parsing exceeded the processing limit")
        valid, result = reader.recv()
        if not valid:
            raise InvalidDocument(result)
        return result
    except EOFError as exc:
        raise InvalidDocument("CV could not be read safely") from exc
    finally:
        reader.close()
        if process.is_alive():
            process.terminate()
        process.join(timeout=2)
        if process.is_alive():
            process.kill()
            process.join()
