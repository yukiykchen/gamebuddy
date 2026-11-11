#!/usr/bin/env python3
"""同步攻略的事实名单，不复制攻略长篇正文。运行时不访问网站。"""
import concurrent.futures
import datetime
import hashlib
import html
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'https://slaythespire2.net/zh-CN/build/'
CHARACTERS = ['ironclad', 'silent', 'defect', 'regent', 'necrobinder']


def text(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()


def fetch(character):
    body = subprocess.check_output(['curl', '--fail', '--retry', '2', '--max-time', '40', '-Ls', '-A', 'Mozilla/5.0', BASE + character]).decode()
    cards = json.loads((ROOT / 'agent/data/codex/cards.json').read_text())
    relics = json.loads((ROOT / 'agent/data/codex/relics.json').read_text())
    builds, unresolved = [], []
    for slug, section in re.findall(r'<section id="build-([^"]+)"[^>]*>(.*?)</section>', body, re.S):
        heading = text(re.search(r'<h2[^>]*>(.*?)</h2>', section, re.S)[1])
        heading = re.sub(r'^[SABC]\s*', '', heading)
        build = {'id': character + ':' + slug, 'character': character, 'name': heading,
                 'source': BASE + character + '#build-' + slug, 'sourceKind': 'guide', 'core': [], 'support': [], 'relics': []}
        chunks = re.split(r'<h3[^>]*>(.*?)</h3>', section, flags=re.S)
        for i in range(1, len(chunks), 2):
            category = {'核心卡牌': 'core', '辅助卡牌': 'support', '关键遗物': 'relics'}.get(text(chunks[i]))
            if not category:
                continue
            collection = relics if category == 'relics' else cards
            for tag in re.findall(r'<img\b[^>]*>', chunks[i + 1]):
                src = re.search(r'\bsrc="([^"]+)"', tag)
                alt = re.search(r'\balt="([^"]*)"', tag)
                if not src or not re.search(r'/images/(?:cards/[^/]+|relics)/', src[1]):
                    continue
                name = html.unescape(alt[1]) if alt else ''
                image_id = src[1].rsplit('/', 1)[-1].split('.')[0].upper()
                match = next((c for c in collection if c['id'] == image_id), None)
                match = match or next((c for c in collection if c['name'] == name), None)
                item = {'id': match['id'] if match else image_id, 'name': name, 'resolved': bool(match)}
                if item['id'] not in [c['id'] for c in build[category]]:
                    build[category].append(item)
                if not match:
                    unresolved.append({'build': build['id'], 'category': category, **item})
        if not build['core']:
            raise ValueError('Missing core cards: ' + build['id'])
        builds.append(build)
    if len(builds) != 5:
        raise ValueError(f'{character}: expected 5 guides, found {len(builds)}; review site changes')
    return {'character': character, 'url': BASE + character, 'sha256': hashlib.sha256(body.encode()).hexdigest()}, builds, unresolved


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(fetch, CHARACTERS))
    result = {'version': 'build-guides-1', 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'sources': [r[0] for r in results], 'builds': [b for r in results for b in r[1]],
              'unresolved': [u for r in results for u in r[2]]}
    target = ROOT / 'agent/knowledge/build-guides.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'builds': len(result['builds']), 'unresolved': result['unresolved']}, ensure_ascii=False))
