#!/usr/bin/env python3
"""Operate live DSH CloudBase plugin UI without a human at the keyboard.

Opens / uses the CloudBase details panel, clicks platform-kit routes, and
writes screenshots for P0 ship-gate evidence.

Requires: Homebrew python3.11 + playwright + Chrome channel.
Usage:
  DSH_URL=http://127.0.0.1:3080 python3.11 scripts/unattended-ui.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = os.environ.get("DSH_URL", "http://127.0.0.1:3080/")
OUT = Path(
    os.environ.get(
        "DSH_UI_SHOTS",
        str(Path.home() / ".ato/workspace/e27cc40c-2864-454d-a369-09b4d954daab/screenshots"),
    )
)

ROUTES = [
    ("storage", "存储"),
    ("functions", "云函数"),
    ("auth", "认证"),
    ("gateway", "网关"),
    ("settings", "设置"),
    ("database", "数据库"),
    ("overview", "概览"),
]


def panel_metrics(page) -> dict:
    return page.evaluate(
        """() => {
          const candidates = [
            document.querySelector('.pI_x6G_detailsCol'),
            document.querySelector('[class*="detailsCol"]'),
            document.querySelector('[data-testid="cb-details"]'),
            document.querySelector('.cb-root'),
          ].filter(Boolean);
          let width = 0;
          let sel = null;
          for (const el of candidates) {
            const w = el.getBoundingClientRect().width;
            if (w > width) {
              width = w;
              sel = el.className || el.getAttribute('data-testid') || el.tagName;
            }
          }
          const nav = [...document.querySelectorAll('button.cb-kit-nav-item')];
          const visibleNav = nav.filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          return {
            width,
            sel: String(sel || ''),
            navCount: nav.length,
            visibleNavCount: visibleNav.length,
            navLabels: visibleNav.map((b) => (b.innerText || '').replace(/\\s+/g, ' ').trim()),
            loading: (document.body.innerText || '').includes('环境加载中'),
          };
        }"""
    )


def click_backend_capsule(page) -> None:
    page.evaluate(
        """() => {
          const btn = [...document.querySelectorAll('button.cb-capsule-btn')]
            .find((el) => (el.innerText || '').includes('后端') || (el.title || '').includes('后端'));
          btn?.click();
        }"""
    )


def ensure_panel_open(page) -> dict:
    m = panel_metrics(page)
    if m["visibleNavCount"] >= 5 and m["width"] > 200:
        click_backend_capsule(page)
        page.wait_for_timeout(500)
        return panel_metrics(page)

    # Click a non-blank session to force details session binding.
    for pattern in [r"开发博客应用", r"\d+\s*小时", r"\d+\s*天"]:
        loc = page.get_by_text(re.compile(pattern))
        if loc.count() == 0:
            continue
        try:
            loc.first.click(timeout=5000, force=True)
            page.wait_for_timeout(2000)
            break
        except Exception:
            continue

    # Wait until nav is visibly laid out (layout patch may already show panel).
    for _ in range(40):
        click_backend_capsule(page)
        m = panel_metrics(page)
        if m["visibleNavCount"] >= 5 and (m["width"] > 200 or not m["loading"]):
            # Extra wait if still loading env
            if m["loading"]:
                page.wait_for_timeout(1500)
                continue
            return m
        page.wait_for_timeout(500)

    m = panel_metrics(page)
    if m["visibleNavCount"] >= 5:
        return m
    raise RuntimeError(f"details panel not operable: {m}")


def click_nav(page, label: str) -> str:
    clicked = page.evaluate(
        """(label) => {
          const buttons = [...document.querySelectorAll('button.cb-kit-nav-item')];
          const btn = buttons.find((el) => {
            const span = el.querySelector('span');
            const st = span ? (span.textContent || '').trim() : '';
            const t = (el.innerText || '').replace(/\\s+/g, ' ');
            return st === label || t.includes(label);
          });
          if (!btn) return null;
          btn.click();
          return (btn.querySelector('span')?.textContent || btn.innerText || '').trim();
        }""",
        label,
    )
    if not clicked:
        raise RuntimeError(f"nav not found: {label}; have={panel_metrics(page).get('navLabels')}")
    return clicked


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"url": URL, "routes": [], "ok": False}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1050})
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)

        try:
            metrics = ensure_panel_open(page)
        except Exception as exc:
            report["error"] = f"open_details: {exc}"
            report["metrics"] = panel_metrics(page)
            page.screenshot(path=str(OUT / "fail-open.png"), full_page=True)
            (OUT / "unattended-report.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            browser.close()
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1

        report["metrics"] = metrics
        page.screenshot(path=str(OUT / "live-overview.png"))
        print("metrics", json.dumps(metrics, ensure_ascii=False))

        for key, label in ROUTES:
            try:
                clicked = click_nav(page, label)
            except Exception as exc:
                report["error"] = str(exc)
                page.screenshot(path=str(OUT / f"fail-{key}.png"))
                (OUT / "unattended-report.json").write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                browser.close()
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 1

            # Wait for page content / env load settle
            page.wait_for_timeout(2000)
            for _ in range(15):
                if "环境加载中" not in page.inner_text("body"):
                    break
                page.wait_for_timeout(800)

            shot = OUT / f"live-{key}.png"
            page.screenshot(path=str(shot))
            body = ""
            page_el = page.locator(".cb-kit-page")
            if page_el.count():
                body = page_el.first.inner_text()[:800]

            if key == "auth":
                page.evaluate(
                    """() => {
                      const row = document.querySelector(
                        'button.cb-kit-table-row, .cb-kit-table-row[role="button"], .cb-kit-table-row'
                      );
                      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    }"""
                )
                page.wait_for_timeout(1000)
                page.screenshot(path=str(OUT / "live-auth-drawer.png"))

            report["routes"].append(
                {"id": key, "label": clicked, "shot": str(shot), "text": body}
            )
            print(f"PASS route {key}: {body.splitlines()[0] if body else '(empty)'}")

        report["ok"] = True
        browser.close()

    (OUT / "unattended-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"ok": True, "n": len(report["routes"]), "metrics": report["metrics"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
