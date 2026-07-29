#!/usr/bin/env python3
"""Erzeugt demo/waermestreifen_ghcn.csv aus NOAA GHCN-Daily (S3, frei zugänglich).

Komplette Pipeline: Inventar laden -> Stationen auswählen -> Tagesdaten laden
-> Jahresmittel & Anomalien rechnen -> CSV im Visual-Schema schreiben.

    python3 tools/fetch_ghcn.py [cache-verzeichnis] [ausgabe.csv]

Stationsauswahl (zwei Stufen):
- Kernstufe: Reihen ab <=1930 bis >=2024, weltweit; Nicht-US-Stationen
  vollständig (40-km-Dedupe), US auf 140 Stationen ausgedünnt (180 km).
- Coverage-Stufe: für Kontinente außerhalb Europa/Nordamerika zusätzlich
  Reihen ab <=1955 (60-km-Dedupe), damit Asien/Afrika/Südamerika/Ozeanien
  vertreten sind.

Methodik je Station:
- Tageswerte mit gesetztem Qualitätsflag (QFLAG) werden verworfen.
- Monatsmittel = (TMAX+TMIN)/2 bei je >=20 Tagen, sonst TAVG bei >=20 Tagen.
- Jahresmittel: >=11 Monate; ein Fehlmonat wird mit der Monats-Klimatologie
  1961-1990 der Station gefüllt. Jahre 1850-2024 (2025 unvollständig).
- Einzeljahr-Spikes (>4 °C gegen Median der +/-5 Nachbarjahre) -> Jahr weg.
- Anomalie = Jahresmittel minus Stationsmittel 1961-1990.
- Stationsfilter: >=25 Basisjahre 1961-1990, >=60 Jahre gesamt, >=3 Jahre
  2020-2024, Reihenbeginn <=1957; nicht-polare Stationen mit >=2 Jahren
  |Anomalie| > 4.2 °C gelten als inhomogen (Stationsumzug) und fliegen raus.

Quelle: NOAA GHCN-Daily (https://noaa-ghcn-pds.s3.amazonaws.com), public domain.
"""
import collections
import csv
import gzip
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

S3 = "https://noaa-ghcn-pds.s3.amazonaws.com"
Y0, Y1 = 1850, 2024
EU_NA = {"US", "CA", "RQ", "GL", "GM", "SW", "UK", "FR", "SP", "RO", "EN", "AU",
         "UP", "SZ", "NL", "EI", "LH", "HU", "BO", "BE", "HR", "MD", "BK", "SI",
         "PO", "EZ", "FI", "LG", "NO", "DA", "IT", "PL", "IC", "GR", "LU", "LO",
         "RS", "KZ"}

# FIPS-Laendercode (GHCN-ID-Praefix) -> (ISO2, Land, Kontinent)
FIPS = {
    "US": ("US", "USA", "Nordamerika"), "CA": ("CA", "Kanada", "Nordamerika"),
    "RQ": ("PR", "Puerto Rico", "Nordamerika"), "GL": ("GL", "Grönland", "Nordamerika"),
    "MX": ("MX", "Mexiko", "Nordamerika"), "CU": ("CU", "Kuba", "Nordamerika"),
    "DR": ("DO", "Dominikanische Republik", "Nordamerika"), "HO": ("HN", "Honduras", "Nordamerika"),
    "BD": ("BM", "Bermuda", "Nordamerika"), "BF": ("BS", "Bahamas", "Nordamerika"),
    "VQ": ("VI", "Amerik. Jungferninseln", "Nordamerika"),
    "AR": ("AR", "Argentinien", "Südamerika"), "UY": ("UY", "Uruguay", "Südamerika"),
    "CI": ("CL", "Chile", "Südamerika"),
    "GM": ("DE", "Deutschland", "Europa"), "SW": ("SE", "Schweden", "Europa"),
    "UK": ("GB", "Großbritannien", "Europa"), "FR": ("FR", "Frankreich", "Europa"),
    "SP": ("ES", "Spanien", "Europa"), "RO": ("RO", "Rumänien", "Europa"),
    "EN": ("EE", "Estland", "Europa"), "AU": ("AT", "Österreich", "Europa"),
    "UP": ("UA", "Ukraine", "Europa"), "SZ": ("CH", "Schweiz", "Europa"),
    "NL": ("NL", "Niederlande", "Europa"), "EI": ("IE", "Irland", "Europa"),
    "LH": ("LT", "Litauen", "Europa"), "HU": ("HU", "Ungarn", "Europa"),
    "BO": ("BY", "Belarus", "Europa"), "BE": ("BE", "Belgien", "Europa"),
    "HR": ("HR", "Kroatien", "Europa"), "MD": ("MD", "Moldau", "Europa"),
    "BK": ("BA", "Bosnien-Herzegowina", "Europa"), "SI": ("SI", "Slowenien", "Europa"),
    "PO": ("PT", "Portugal", "Europa"), "EZ": ("CZ", "Tschechien", "Europa"),
    "FI": ("FI", "Finnland", "Europa"), "LG": ("LV", "Lettland", "Europa"),
    "NO": ("NO", "Norwegen", "Europa"), "DA": ("DK", "Dänemark", "Europa"),
    "IT": ("IT", "Italien", "Europa"), "PL": ("PL", "Polen", "Europa"),
    "IC": ("IS", "Island", "Europa"), "GR": ("GR", "Griechenland", "Europa"),
    "LU": ("LU", "Luxemburg", "Europa"), "LO": ("SK", "Slowakei", "Europa"),
    "BU": ("BG", "Bulgarien", "Europa"), "RI": ("RS", "Serbien", "Europa"),
    "SV": ("SJ", "Spitzbergen (Norwegen)", "Europa"), "JN": ("SJ", "Jan Mayen (Norwegen)", "Europa"),
    "RS": ("RU", "Russland", None),  # Kontinent nach Laengengrad (Ural ~60°O)
    "KZ": ("KZ", "Kasachstan", "Asien"), "TX": ("TM", "Turkmenistan", "Asien"),
    "TU": ("TR", "Türkei", "Asien"), "TI": ("TJ", "Tadschikistan", "Asien"),
    "CE": ("LK", "Sri Lanka", "Asien"), "UZ": ("UZ", "Usbekistan", "Asien"),
    "AJ": ("AZ", "Aserbaidschan", "Asien"), "GG": ("GE", "Georgien", "Asien"),
    "KG": ("KG", "Kirgisistan", "Asien"), "KS": ("KR", "Südkorea", "Asien"),
    "JA": ("JP", "Japan", "Asien"), "CH": ("CN", "China", "Asien"),
    "IN": ("IN", "Indien", "Asien"), "TH": ("TH", "Thailand", "Asien"),
    "IR": ("IR", "Iran", "Asien"), "MY": ("MY", "Malaysia", "Asien"),
    "RP": ("PH", "Philippinen", "Asien"), "BM": ("MM", "Myanmar", "Asien"),
    "LA": ("LA", "Laos", "Asien"), "CB": ("KH", "Kambodscha", "Asien"),
    "PK": ("PK", "Pakistan", "Asien"), "AM": ("AM", "Armenien", "Asien"),
    "BA": ("BH", "Bahrain", "Asien"), "AE": ("AE", "Ver. Arab. Emirate", "Asien"),
    "MU": ("OM", "Oman", "Asien"), "IS": ("IL", "Israel", "Asien"),
    "ID": ("ID", "Indonesien", "Asien"),
    "AG": ("DZ", "Algerien", "Afrika"), "LY": ("LY", "Libyen", "Afrika"),
    "NG": ("NE", "Niger", "Afrika"), "SG": ("SN", "Senegal", "Afrika"),
    "EG": ("EG", "Ägypten", "Afrika"), "MO": ("MA", "Marokko", "Afrika"),
    "SF": ("ZA", "Südafrika", "Afrika"), "TS": ("TN", "Tunesien", "Afrika"),
    "GV": ("GN", "Guinea", "Afrika"), "IV": ("CI", "Elfenbeinküste", "Afrika"),
    "MZ": ("MZ", "Mosambik", "Afrika"), "TO": ("TG", "Togo", "Afrika"),
    "CF": ("CG", "Republik Kongo", "Afrika"), "CT": ("CF", "Zentralafrik. Republik", "Afrika"),
    "ET": ("ET", "Äthiopien", "Afrika"), "UV": ("BF", "Burkina Faso", "Afrika"),
    "ZI": ("ZW", "Simbabwe", "Afrika"), "BN": ("BJ", "Benin", "Afrika"),
    "CD": ("TD", "Tschad", "Afrika"), "MP": ("MU", "Mauritius", "Afrika"),
    "AS": ("AU", "Australien", "Ozeanien"), "NZ": ("NZ", "Neuseeland", "Ozeanien"),
    "GQ": ("GU", "Guam", "Ozeanien"), "FM": ("FM", "Mikronesien", "Ozeanien"),
    "RM": ("MH", "Marshallinseln", "Ozeanien"), "BP": ("SB", "Salomonen", "Ozeanien"),
    "TV": ("TV", "Tuvalu", "Ozeanien"), "CK": ("CC", "Kokosinseln (Austr.)", "Ozeanien"),
    "AY": ("AQ", "Antarktis", "Antarktis"),
}

ACRO = {"AWS", "AMO", "AP", "AB", "WSO", "WSFO", "USAF", "NWS", "ARPT", "INTL",
        "AFB", "RAF", "CDA", "CS", "GSN", "SMN", "II", "AWOS", "ASOS", "RCS"}


def fetch(path, dest):
    if not os.path.exists(dest):
        urllib.request.urlretrieve(S3 + path, dest)
    return dest


def load_inventory(cache):
    cov = {}
    for line in open(fetch("/ghcnd-inventory.txt", os.path.join(cache, "ghcnd-inventory.txt"))):
        sid, _lat, _lon, elem, first, last = line.split()
        if elem in ("TMAX", "TMIN", "TAVG"):
            cov.setdefault(sid, {})[elem] = (int(first), int(last))
    span = {}
    for sid, d in cov.items():
        if "TMAX" in d and "TMIN" in d:
            span[sid] = (max(d["TMAX"][0], d["TMIN"][0]), min(d["TMAX"][1], d["TMIN"][1]))
        elif "TAVG" in d:
            span[sid] = d["TAVG"]
    return span


def load_meta(cache):
    meta = {}
    for line in open(fetch("/ghcnd-stations.txt", os.path.join(cache, "ghcnd-stations.txt"))):
        meta[line[0:11]] = (float(line[12:20]), float(line[21:30]), line[41:71].strip())
    return meta


def km(a, b):
    dlat = a[0] - b[0]
    dlon = (a[1] - b[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dlat, dlon) * 111.0


def select(span, meta):
    def dedupe(cands, min_km, into, cap=None):
        n = 0
        for s in cands:
            if cap is not None and n >= cap:
                break
            p = meta[s][:2]
            if all(km(p, meta[t][:2]) > min_km for t in into):
                into.append(s)
                n += 1
        return n

    core = sorted((s for s, (f, l) in span.items()
                   if l >= 2024 and f <= 1930 and s[:2] in FIPS),
                  key=lambda s: span[s][0])
    sel = []
    dedupe([s for s in core if not s.startswith("US")], 40, sel)
    dedupe([s for s in core if s.startswith("US")], 180, sel, cap=140)
    coverage = sorted((s for s, (f, l) in span.items()
                       if l >= 2024 and f <= 1955 and s[:2] in FIPS and s[:2] not in EU_NA),
                      key=lambda s: span[s][0])
    dedupe(coverage, 60, sel)
    return sel


def clean_name(raw_name):
    words = " ".join(raw_name.replace("_", " ").split()).split(" ")
    out = []
    for w in words:
        if w.upper() in ACRO:
            out.append(w.upper())
        else:
            out.append("-".join(p.capitalize() for p in w.split("-")))
    return " ".join(out)


def station_series(path):
    acc = collections.defaultdict(lambda: [0.0, 0, 0.0, 0, 0.0, 0])
    with gzip.open(path, "rt", newline="") as f:
        for row in csv.reader(f):
            elem = row[2]
            if elem not in ("TMAX", "TMIN", "TAVG") or row[5]:
                continue
            v = int(row[3]) / 10.0
            if v < -90 or v > 65:
                continue
            a = acc[(int(row[1][0:4]), int(row[1][4:6]))]
            if elem == "TMAX":
                a[0] += v; a[1] += 1
            elif elem == "TMIN":
                a[2] += v; a[3] += 1
            else:
                a[4] += v; a[5] += 1
    months = {}
    for ym, (mxs, mxn, mns, mnn, avs, avn) in acc.items():
        if mxn >= 20 and mnn >= 20:
            months[ym] = (mxs / mxn + mns / mnn) / 2
        elif avn >= 20:
            months[ym] = avs / avn
    return months


def annuals(months):
    clim_acc = collections.defaultdict(lambda: [0.0, 0])
    for (y, m), v in months.items():
        if 1961 <= y <= 1990:
            clim_acc[m][0] += v
            clim_acc[m][1] += 1
    clim = {m: s / n for m, (s, n) in clim_acc.items() if n >= 20}
    if len(clim) < 12:
        return {}
    out = {}
    for y in range(Y0, Y1 + 1):
        vals, missing = [], []
        for m in range(1, 13):
            v = months.get((y, m))
            if v is None:
                missing.append(m)
            else:
                vals.append(v)
        if len(missing) > 1:
            continue
        vals += [clim[m] for m in missing]
        out[y] = sum(vals) / 12.0
    years = sorted(out)
    for y in list(years):
        nb = sorted(out[t] for t in years if t != y and abs(t - y) <= 5 and t in out)
        if len(nb) >= 4 and abs(out[y] - nb[len(nb) // 2]) > 4.0:
            del out[y]
    return out


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else ".ghcn-cache"
    out_csv = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(__file__), "..", "demo", "waermestreifen_ghcn.csv")
    os.makedirs(os.path.join(cache, "raw"), exist_ok=True)

    print("Inventar & Stationsliste laden ...", file=sys.stderr)
    span = load_inventory(cache)
    meta = load_meta(cache)
    sel = select(span, meta)
    print(f"{len(sel)} Stationen ausgewählt, lade Tagesdaten ...", file=sys.stderr)

    def dl(sid):
        fetch(f"/csv.gz/by_station/{sid}.csv.gz", os.path.join(cache, "raw", sid + ".csv.gz"))
    with ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(dl, sel))

    rows, kept, skipped, seen_names = [], [], collections.Counter(), set()
    for n, sid in enumerate(sorted(sel), 1):
        iso, land, kontinent = FIPS[sid[:2]]
        lat, lon, raw_name = meta[sid]
        if kontinent is None:
            kontinent = "Asien" if lon >= 60 else "Europa"
        ann = annuals(station_series(os.path.join(cache, "raw", sid + ".csv.gz")))
        base_years = [v for y, v in ann.items() if 1961 <= y <= 1990]
        if len(base_years) < 25:
            skipped["baseline"] += 1; continue
        if len(ann) < 60:
            skipped["laenge"] += 1; continue
        if sum(1 for y in ann if 2020 <= y <= 2024) < 3:
            skipped["aktuell"] += 1; continue
        if min(ann) > 1957:
            skipped["start"] += 1; continue
        base = sum(base_years) / len(base_years)
        if abs(lat) < 58 and sum(1 for v in ann.values() if abs(v - base) > 4.2) >= 2:
            skipped["inhomogen"] += 1; continue
        name = clean_name(raw_name)
        while (name, iso) in seen_names:
            name += " (2)"
        seen_names.add((name, iso))
        kept.append(sid)
        for y in sorted(ann):
            rows.append((kontinent, name, iso, round(lat, 3), round(lon, 3),
                         round(base, 2), y, round(ann[y] - base, 2)))
        if n % 100 == 0:
            print(f"  {n}/{len(sel)} verarbeitet, {len(kept)} behalten", file=sys.stderr)

    with open(out_csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Region", "Ort", "Land", "Breitengrad", "Laengengrad",
                    "MittelC_1961_1990", "Jahr", "AnomalieC"])
        w.writerows(rows)
    print(f"Stationen behalten: {len(kept)}, verworfen: {dict(skipped)}")
    print(f"Zeilen: {len(rows)} -> {out_csv}")
    print("Stationen je Region (2024):",
          dict(collections.Counter(r[0] for r in rows if r[6] == 2024)))


if __name__ == "__main__":
    main()
