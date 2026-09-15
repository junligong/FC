#!/usr/bin/env python3
"""
作用：批量抓取FC27金卡六维、特技、身高、位置和技能数据。
从 fc27-gold-unique.json 读取 227 个唯一球员 URL，逐批 fetch 详情页解析:
- 六维 (PAC/SHO/PAS/DRI/DEF/PHY)
- 金银特技 (playstyles, gold=psplus class)
- 身高/技能/逆足 (player-info-box-player-info)
- 主位置+副位置 (playercard-27-position / alt-pos-sub)
- OVR (title)
输出到 gold/data/players/fc27/fc27-gold-playstyles.json
"""
import json, base64, subprocess, sys, time, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'gold', 'data', 'players', 'fc27')
LIST_FILE = os.path.join(DATA_DIR, 'fc27-gold-unique.json')
OUT_FILE = os.path.join(DATA_DIR, 'fc27-gold-playstyles.json')

def build_js(urls, batch_idx):
    """构造页面内执行的抓取脚本（base64）"""
    urls_json = json.dumps(urls)
    js = f"""
(async () => {{
  const BATCH = {batch_idx};
  const urls = {urls_json};
  const results = [];
  let ok = 0, fail = 0;
  for (const item of urls) {{
    const url = item.url;
    const rel = url.replace('https://www.futbin.com', '');
    try {{
      const res = await fetch(rel, {{ credentials: 'include' }});
      if (!res.ok) {{ fail++; results.push({{ url, error: 'HTTP ' + res.status }}); continue; }}
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const title = doc.title;
      const ovr = parseInt((title.match(/FC 27 - (\\d+) -/) || [])[1], 10);
      // 六维
      const six = {{ PAC:null, SHO:null, PAS:null, DRI:null, DEF:null, PHY:null }};
      const map = {{ 'Pace':'PAC','Shooting':'SHO','Passing':'PAS','Dribbling':'DRI','Defending':'DEF','Physical':'PHY' }};
      for (const r of doc.querySelectorAll('.player-stat-row')) {{
        const kids = [...r.children];
        if (kids.length >= 2) {{
          const label = kids[0].textContent.trim();
          const val = parseInt(kids[1].textContent.trim(), 10);
          if (map[label] && !isNaN(val)) six[map[label]] = val;
        }}
      }}
      // 金银特技
      const playstyles = [...doc.querySelectorAll('.playStyle-table-icon')].map(e => ({{
        name: e.textContent.trim(),
        gold: e.className.includes('psplus')
      }}));
      // 信息串: 技能/逆足/身高
      const infoEl = doc.querySelector('[class*="player-info-box-player-info" i]');
      const info = infoEl ? infoEl.textContent.trim().replace(/\\s+/g, ' ') : '';
      const skills = (info.match(/Skills (\\d)/) || [])[1] || null;
      const weakFoot = (info.match(/Weak Foot (\\d)/) || [])[1] || null;
      const height = (info.match(/Height (\\d+)cm/) || [])[1] ? parseInt((info.match(/Height (\\d+)cm/) || [])[1], 10) : null;
      const foot = (info.match(/Foot (\\w+)/) || [])[1] || null;
      const ageMatch = info.match(/Age (\\d+) years? old/);
      const age = ageMatch ? parseInt(ageMatch[1], 10) : null;
      // 主位置 + 副位置
      let position = null;
      const posEl = doc.querySelector('.playercard-27-position');
      if (posEl) position = posEl.textContent.trim();
      const altPos = [...doc.querySelectorAll('.playercard-27-alt-pos-sub')]
        .map(e => e.textContent.trim()).filter(t => t).slice(0, 4);
      // 加速类型（详情页可能无，尝试从页面文本提取所属 Archetype）
      results.push({{
        url, name: item.name, nameZh: item.nameZh, slug: item.slug,
        ovr, position, altPos, six,
        skills: skills ? parseInt(skills, 10) : null,
        weakFoot: weakFoot ? parseInt(weakFoot, 10) : null,
        height, foot, age,
        playstyles,
        playstyleCount: playstyles.length,
        goldCount: playstyles.filter(p => p.gold).length
      }});
      ok++;
    }} catch (e) {{
      fail++;
      results.push({{ url, name: item.name, error: String(e).slice(0, 120) }});
    }}
    await new Promise(res => setTimeout(res, 120));
  }}
  return JSON.stringify({{ batch: BATCH, ok, fail, results }}, null, 0);
}})()
"""
    return base64.b64encode(js.encode('utf-8')).decode('ascii')

def run_batch(urls, batch_idx):
    b64 = build_js(urls, batch_idx)
    cmd = f"dumate-browser-cli eval --timeout 180000 \"eval(atob('{b64}'))\""
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
    out = r.stdout
    # 提取 ### Result 之后的行
    try:
        result_part = out.split('### Result')[1].split('### Ran')[0].strip()
        # 结果可能是 JSON 字符串（带引号），需要解析
        data = json.loads(result_part)
        if isinstance(data, str):
            data = json.loads(data)
        return data
    except Exception as e:
        print(f"  [batch {batch_idx}] parse error: {e}")
        print(out[-1500:])
        return None

def main():
    players = json.load(open(LIST_FILE, encoding='utf-8'))
    print(f"Total unique players: {len(players)}")
    # 检查是否已抓取（续跑支持）
    done_urls = set()
    if os.path.exists(OUT_FILE):
        prev = json.load(open(OUT_FILE, encoding='utf-8'))
        done_urls = {p.get('url') for p in prev if 'error' not in p}
        print(f"Resume: {len(done_urls)} already done")
    todo = [p for p in players if p['url'] not in done_urls]
    print(f"To fetch: {len(todo)}")

    BATCH_SIZE = 6
    all_results = []
    if os.path.exists(OUT_FILE):
        all_results = json.load(open(OUT_FILE, encoding='utf-8'))
    # 过滤掉错误项以便重抓
    all_results = [p for p in all_results if 'error' in p and p['url'] in {x['url'] for x in players}]

    batch_idx = 0
    for i in range(0, len(todo), BATCH_SIZE):
        batch = todo[i:i+BATCH_SIZE]
        batch_idx += 1
        print(f"Batch {batch_idx}: {len(batch)} players (from {i+1} to {i+len(batch)})...", flush=True)
        data = run_batch(batch, batch_idx)
        if data is None:
            print("  FAILED batch, retrying once with delay...")
            time.sleep(5)
            data = run_batch(batch, batch_idx)
        if data is None:
            print(f"  WARNING: batch {batch_idx} failed twice, skipping URLs")
            continue
        all_results.extend(data.get('results', []))
        # 每次落盘
        existing = []
        if os.path.exists(OUT_FILE):
            existing = json.load(open(OUT_FILE, encoding='utf-8'))
        merged = {}
        for p in existing:
            if 'error' not in p:
                merged[p['url']] = p
        for p in all_results:
            merged[p['url']] = p
        with open(OUT_FILE, 'w', encoding='utf-8') as fh:
            json.dump(list(merged.values()), fh, indent=1, ensure_ascii=False)
        print(f"  ok={data.get('ok')} fail={data.get('fail')} total_saved={len(merged)}", flush=True)
        time.sleep(1.5)

    # 终版统计
    final = json.load(open(OUT_FILE, encoding='utf-8'))
    good = [p for p in final if 'error' not in p]
    bad = [p for p in final if 'error' in p]
    print(f"\n=== DONE === good={len(good)} bad={len(bad)} total={len(final)}")
    if bad:
        print("Failed URLs:")
        for b in bad[:10]:
            print(" ", b.get('url'), b.get('error', ''))

if __name__ == '__main__':
    main()
