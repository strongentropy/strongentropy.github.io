.PHONY: help deploy deploy-site deploy-worker test test-headers test-auth test-flush open graph flush hooks

help:
	@echo "Strong Entropy — available targets:"
	@echo ""
	@echo "  deploy          Push site + deploy worker"
	@echo "  deploy-site     git push (GitHub Pages)"
	@echo "  deploy-worker   Deploy Cloudflare Worker"
	@echo ""
	@echo "  test            Run all smoke tests"
	@echo "  test-headers    Check security headers"
	@echo "  test-auth       Check /graph and /api/logs auth gates"
	@echo "  test-flush      Check /flush endpoint"
	@echo ""
	@echo "  flush           Trigger on-demand KV → GitHub log flush"
	@echo "  hooks           Install git pre-commit hooks"
	@echo ""
	@echo "  open            Open strongentropy.com in browser"
	@echo "  graph           Open /graph/ in browser"

SITE_URL   = https://strongentropy.com
GRAPH_USER = admin
# Export GRAPH_PASSWORD and FLUSH_TOKEN from your shell or .env.local
-include .env.local

# ── Deploy ────────────────────────────────────────────────────────────────────

deploy: deploy-site deploy-worker

deploy-site:
	git push

deploy-worker:
	$(MAKE) -C worker deploy

# ── Test ─────────────────────────────────────────────────────────────────────

test: test-headers test-auth test-flush
	@echo ""
	@echo "All tests passed."

test-headers:
	@echo "=== Security Headers ==="
	@curl -sI $(SITE_URL)/ | grep -E "^(strict-transport|x-content|x-frame|referrer|content-security|cross-origin|permissions)" --color=never \
	  || (echo "FAIL: missing security headers" && exit 1)
	@echo ""

test-auth:
	@echo "=== Auth Gates ==="
	@STATUS=$$(curl -so /dev/null -w "%{http_code}" $(SITE_URL)/graph/); \
	  [ "$$STATUS" = "401" ] && echo "PASS  /graph/ returns 401 without auth" \
	  || (echo "FAIL  /graph/ returned $$STATUS, expected 401" && exit 1)
	@STATUS=$$(curl -so /dev/null -w "%{http_code}" $(SITE_URL)/api/logs); \
	  [ "$$STATUS" = "401" ] && echo "PASS  /api/logs returns 401 without auth" \
	  || (echo "FAIL  /api/logs returned $$STATUS, expected 401" && exit 1)
	@STATUS=$$(curl -so /dev/null -w "%{http_code}" -u "$(GRAPH_USER):$(GRAPH_PASSWORD)" "$(SITE_URL)/graph/"); \
	  [ "$$STATUS" = "200" ] && echo "PASS  /graph/ returns 200 with auth" \
	  || (echo "FAIL  /graph/ returned $$STATUS with auth" && exit 1)
	@STATUS=$$(curl -so /dev/null -w "%{http_code}" -u "$(GRAPH_USER):$(GRAPH_PASSWORD)" "$(SITE_URL)/api/logs?days=1"); \
	  [ "$$STATUS" = "200" ] && echo "PASS  /api/logs returns 200 with auth" \
	  || (echo "FAIL  /api/logs returned $$STATUS with auth" && exit 1)
	@echo ""

test-flush:
	@echo "=== Flush Endpoint ==="
	@[ -n "$(FLUSH_TOKEN)" ] || (echo "SKIP  FLUSH_TOKEN not set" && exit 0)
	@RESP=$$(curl -s "$(SITE_URL)/flush?token=$(FLUSH_TOKEN)"); \
	  echo "$$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" \
	  && echo "PASS  /flush triggered OK" \
	  || (echo "FAIL  /flush response: $$RESP" && exit 1)
	@echo ""

# ── On-demand flush ───────────────────────────────────────────────────────────

flush:
	@[ -n "$(FLUSH_TOKEN)" ] || (echo "Set FLUSH_TOKEN in .env.local or environment" && exit 1)
	@curl -s "$(SITE_URL)/flush?token=$(FLUSH_TOKEN)" | python3 -m json.tool

# ── Git hooks ─────────────────────────────────────────────────────────────────

hooks:
	git config core.hooksPath .githooks
	@echo "Git hooks installed. Run: brew install gitleaks"

# ── Open in browser ───────────────────────────────────────────────────────────

open:
	open $(SITE_URL)

graph:
	open $(SITE_URL)/graph/
