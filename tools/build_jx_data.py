#!/usr/bin/env python3
"""Parse public Jiangxi 2020 一分一段 + 投档表 into js/data/jiangxi2020.js."""
from __future__ import annotations
import json, re, pathlib

ROOT = pathlib.Path("/tmp/sj-data")
OUT = pathlib.Path("/workspace/sanchi-jiangtai/js/data/jiangxi2020.js")

PROVINCIAL = {
    2017: {"wen": {"first": 533, "second": 458, "special": 150},
           "li":  {"first": 503, "second": 422, "special": 150},
           "source": "江西省教育考试院，人民网2017-06-23报道"},
    2018: {"wen": {"first": 568, "second": 496, "special": 160},
           "li":  {"first": 527, "second": 447, "special": 160},
           "source": "江西省教育考试院（2018–2022历年分数线整理）"},
    2019: {"wen": {"first": 558, "second": 502, "special": 160},
           "li":  {"first": 522, "second": 449, "special": 160},
           "source": "江西省教育考试院；2019年文科一本558、二本502，理科一本522、二本449"},
    2020: {"wen": {"first": 547, "second": 488, "special": 150},
           "li":  {"first": 535, "second": 463, "special": 150},
           "source": "江西省教育考试院2020-07-23新闻发布会，学信网转载"},
}

def parse_li_rank(path: pathlib.Path):
    text = path.read_text(encoding="utf-8")
    rows = []
    m0 = re.search(r"\| 695-750 \| (\d+) \| (\d+) \|", text)
    if m0:
        rows.append((750, int(m0.group(2))))  # all 695-750 bucket; we'll also add 695
        rows.append((695, int(m0.group(2))))
    for m in re.finditer(r"\| (\d+) \| (\d+) \| (\d+) \| (\d+)-(\d+) \|", text):
        score, _n, cum, _lo, _hi = map(int, m.groups())
        rows.append((score, cum))
    # unique by score, prefer later (more complete)
    by = {}
    for s, c in rows:
        by[s] = c
    # 0-100 bucket
    m1 = re.search(r"\| 0-100 \| (\d+) \| (\d+) \|", text)
    if m1:
        by[100] = by.get(100, int(m1.group(2)) - int(m1.group(1)))
        by[0] = int(m1.group(2))
    return [[s, by[s]] for s in sorted(by, reverse=True)]



def parse_wen_rank(path: pathlib.Path):
    text = path.read_text(encoding="utf-8")
    start = text.find("651及以上")
    end = text.find("如果你需要在线作图")
    tokens = [x.strip() for x in text[start:end].splitlines() if x.strip()]
    def is_num(s):
        return bool(re.fullmatch(r"\d+", s))
    def is_next_score(tok, score):
        if not is_num(tok):
            return False
        v = int(tok)
        return score - 8 <= v <= score - 1
    rows = []
    i, n = 0, len(tokens)
    prev_cum, prev_score = 0, 652
    while i < n:
        tok = tokens[i]
        if tok == "651及以上":
            nums = []
            j = i + 1
            while j < n and is_num(tokens[j]) and len(nums) < 2:
                nums.append(int(tokens[j])); j += 1
            prev_cum = nums[-1]
            rows.append((651, prev_cum))
            prev_score, i = 651, j
            continue
        if tok == "100及以下":
            nums = []
            j = i + 1
            while j < n and is_num(tokens[j]) and len(nums) < 2:
                nums.append(int(tokens[j])); j += 1
            if nums:
                cum = nums[-1] if nums[-1] > 20000 else prev_cum + nums[0]
                rows.append((0, cum))
            break
        if not is_num(tok):
            i += 1
            continue
        score = int(tok)
        if not (101 <= score <= 650) or score > prev_score:
            i += 1
            continue
        j = i + 1
        vals = []
        while j < n and is_num(tokens[j]) and len(vals) < 2:
            if vals and is_next_score(tokens[j], score):
                break
            vals.append(int(tokens[j])); j += 1
        if len(vals) >= 2 and vals[1] >= prev_cum and vals[1] >= vals[0]:
            cum = vals[1]
        elif len(vals) >= 1 and vals[0] > prev_cum:
            cum = vals[0]
        elif len(vals) >= 1:
            cum = prev_cum + vals[0]
        else:
            cum = prev_cum
        rows.append((score, cum))
        prev_cum, prev_score, i = cum, score, j
    by = {s: c for s, c in rows}
    return [[s, by[s]] for s in sorted(by, reverse=True)]


SKIP_NAME = re.compile(
    r"(中外合作|地方专项|苏区|预科|只招|软件类|职教本科|就读|其它|其他|物质科学|农学类|医学类专业)"
)


def parse_admission(path: pathlib.Path):
    text = path.read_text(encoding="utf-8")
    out = []
    pat = re.compile(
        r"\| ([^|\n]+) \| ([^|\n]+) \| 江西 \| 2020 \| (文科|理科) \| ([^|\n]+) \| ([^|\n]+) \| ([^|\n]+) \|"
    )
    for m in pat.finditer(text):
        name, typ, track, batch, score, rank = [x.strip() for x in m.groups()]
        if score in ("-", "—", "") or not re.search(r"\d", score):
            continue
        try:
            score_i = int(float(score))
        except ValueError:
            continue
        rank_i = None
        if re.fullmatch(r"\d+", rank):
            rank_i = int(rank)
        if SKIP_NAME.search(name):
            continue
        batch_n = {"本一": "一批", "本二": "二批", "专科": "专科"}.get(batch, batch)
        out.append({
            "name": name,
            "category": typ,
            "track": "wen" if track == "文科" else "li",
            "batch": batch_n,
            "score": score_i,
            "rank": rank_i,
        })
    return out


def main():
    li_rank = parse_li_rank(ROOT / "li-yifenyiduan.md")
    wen_rank = parse_wen_rank(ROOT / "wen-yifenyiduan.md")
    # sanity
    def lookup(table, score):
        for s, c in table:
            if s <= score:
                return c
        return table[-1][1]
    print("理科 535", lookup(li_rank, 535), "expect ~43925")
    print("理科 463", lookup(li_rank, 463), "expect ~103722")
    print("理科 600", lookup(li_rank, 600), "expect ~11673")
    print("理科 686", lookup(li_rank, 686), "expect ~48")
    print("文科 547", lookup(wen_rank, 547), "expect ~10974")
    print("文科 488", lookup(wen_rank, 488), "expect ~42296")
    print("文科 600", lookup(wen_rank, 600), "expect ~1125")
    print("文科 649", lookup(wen_rank, 649), "expect ~13")
    print("文科 rows", len(wen_rank), "li rows", len(li_rank))
    print("wen head", wen_rank[:15])
    print("wen around 547", [x for x in wen_rank if 540 <= x[0] <= 555])

    files = ["li-zonghe.md", "li-ligong.md", "wen-zonghe.md"]
    caijing = pathlib.Path("/cursor/stores/user/grok-bot/agents/a2fba06c-4bfd-4df4-9195-4ddc4505ad3c/assets")
    # include any later caijing if saved as md in tmp
    if (ROOT / "li-caijing.md").exists():
        files.append("li-caijing.md")
    admissions = []
    for f in files:
        admissions.extend(parse_admission(ROOT / f))

    # filter 专科 with wildly inconsistent ranks vs 一分一段
    li_map = {s: c for s, c in li_rank}
    wen_map = {s: c for s, c in wen_rank}

    def rank_ok(row):
        if row["rank"] is None:
            return row["batch"] != "专科"  # keep 专科 without rank only if score>=150
        table = li_map if row["track"] == "li" else wen_map
        # nearest score
        sc = row["score"]
        if sc not in table:
            # interpolate neighbor
            keys = sorted(table, reverse=True)
            ref = None
            for k in keys:
                if k <= sc:
                    ref = table[k]
                    break
            if ref is None:
                ref = table[keys[-1]]
        else:
            ref = table[sc]
        if row["batch"] == "专科" and row["score"] >= 150:
            # drop if rank is an order of magnitude off (wrong table)
            if ref and row["rank"] < ref * 0.2 and row["score"] < 500:
                return False
        return True

    admissions = [a for a in admissions if rank_ok(a) and 150 <= a["score"] <= 750]

    # dedup: same track+name+batch keep first (already highest score lists first usually)
    # sort high score first
    admissions.sort(key=lambda a: (a["track"], a["batch"] != "一批", a["batch"] != "二批", -a["score"], a["name"]))
    seen = set()
    uniq = []
    for a in admissions:
        k = (a["track"], a["name"], a["batch"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(a)
    admissions = uniq
    print("admissions", len(admissions),
          "li", sum(1 for a in admissions if a["track"]=="li"),
          "wen", sum(1 for a in admissions if a["track"]=="wen"))
    print("batches", {b: sum(1 for a in admissions if a["batch"]==b) for b in ("一批","二批","专科")})

    payload = {
        "sourceNotes": {
            "provincialLines": "2017人民网转江西省分数线；2018–2019江西省教育考试院历年分数线；2020-07-23江西省教育考试院新闻发布会（学信网转载）。",
            "rankTables": "2020江西省教育考试院一分一段（理工/文史）。理工表据公开一分一段整理；文史表据江西省本科文史分段表公开转载整理。",
            "admission": "2020江西第一批/第二批/专科投档与录取最低分、位次，综合整理自公开的江西院校投档/录取汇总（综合类、理工类、财经类、文科综合类）。已去掉专项、中外合作、预科等非普通计划，避免把专项分当成普通投档线。",
            "laterYears": "2018、2019、2021及以后年份的院校线按当年省控线相对2020年的分差平移2020投档结构，并在界面标明；不伪造缺失年份的完整投档表。",
        },
        "provincial": PROVINCIAL,
        "rankLi": li_rank,
        "rankWen": wen_rank,
        "universities": admissions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = "/** 江西公开高考数据（只读对照表）。由 tools/build_jx_data.py 生成。 */\n"
    body += "export const JX_DATA = "
    body += json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    body += ";\n"
    OUT.write_text(body, encoding="utf-8")
    print("wrote", OUT, "bytes", OUT.stat().st_size)

if __name__ == "__main__":
    main()
