#!/usr/bin/env python3
"""Derive AcroForm field tokens + labels from an IRS PDF, for building formFields<year>.ts.

Usage:  python3 derive-fields.py path/to/f1040.pdf
        python3 derive-fields.py path/to/f1040.pdf --checkboxes   # also dump Btn fields

Prints, per page:
  - the form-year header line (sanity-check you fetched the right year)
  - every text field as: TOKEN  y=..  x=..  | nearest printed label
  - a terminal-token duplicate report (dup tokens must be referenced by FULL name)
With --checkboxes: every button field with its export states + label (for filing status etc.)

Requires pypdf (`pip install pypdf`). Read-only; touches nothing.
"""
import sys
from collections import Counter

import pypdf


def words(page):
    out = []

    def vis(t, cm, tm, fd, fs):
        if t.strip():
            out.append((round(tm[5]), round(tm[4]), t.strip()))

    page.extract_text(visitor_text=vis)
    return out


def label_for(ws, fy, fx0, fx1):
    # prefer a label sitting just above the box; else words to the left on the same row
    above = [w for w in ws if fy + 5 < w[0] < fy + 22 and fx0 - 10 <= w[1] <= fx1 + 10]
    if above:
        above.sort(key=lambda w: w[1])
        return " ".join(w[2] for w in above)[:60]
    left = [w for w in ws if abs(w[0] - fy) < 5 and w[1] < fx0]
    left.sort(key=lambda w: w[1])
    return " ".join(w[2] for w in left)[-60:]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    want_btn = "--checkboxes" in sys.argv
    r = pypdf.PdfReader(path)

    all_names = list((r.get_fields() or {}).keys())
    dup = {k: v for k, v in Counter(n.split(".")[-1] for n in all_names).items() if v > 1}

    for pi, pg in enumerate(r.pages):
        ws = words(pg)
        yr = [l for l in pg.extract_text().splitlines() if "For the year" in l or "Form" in l and "20" in l]
        annots = pg.get("/Annots") or []
        fields = []
        for a in annots:
            o = a.get_object()
            if o.get("/Subtype") != "/Widget":
                continue
            ft = o.get("/FT")
            if ft == "/Tx" or (want_btn and ft == "/Btn"):
                rc = o.get("/Rect")
                nm = o.get("/T")
                if not (rc and nm):
                    continue
                # full name via parent chain
                parts, q = [], o
                while q is not None:
                    t = q.get("/T")
                    if t:
                        parts.append(str(t))
                    par = q.get("/Parent")
                    q = par.get_object() if par else None
                full = ".".join(reversed(parts))
                states = []
                ap = o.get("/AP")
                if ap and ap.get("/N"):
                    try:
                        states = list(ap["/N"].get_object().keys())
                    except Exception:
                        pass
                fields.append((round(float(rc[1])), round(float(rc[0])), round(float(rc[2])), str(ft), full, states))
        fields.sort(key=lambda t: (-t[0], t[1]))
        print(f"\n===== {path.split('/')[-1]} PAGE {pi+1} =====")
        if yr:
            print("  HEADER:", yr[0].strip()[:70])
        for fy, fx0, fx1, ft, full, states in fields:
            tok = full.split(".")[-1]
            lab = label_for(ws, fy, fx0, fx1)
            extra = f" states={states}" if ft == "/Btn" else ""
            flag = "  <DUP: use full name>" if tok in dup else ""
            print(f"  {tok:11} {ft:5} y={fy:4} | {lab}{extra}{flag}")
            if ft == "/Btn":
                print(f"      full: {full}")

    if dup:
        print("\nTerminal-token duplicates (reference these by FULL name, not token):")
        for k, v in sorted(dup.items()):
            print(f"  {k} x{v}")


if __name__ == "__main__":
    main()
