.PHONY: install dev deploy kv-create secret secret-graph secret-flush secret-abuseipdb flush flush-url logs

install:
	npm install

WRANGLER = ./node_modules/.bin/wrangler --config wrangler.toml

# Local dev (proxies through wrangler)
dev:
	$(WRANGLER) dev

# Deploy worker to Cloudflare
deploy:
	$(WRANGLER) deploy

# One-time: create the KV namespace, then paste the id into wrangler.toml
kv-create:
	npx wrangler kv:namespace create VISITS

# Set the GitHub PAT secret
secret:
	npx wrangler secret put GITHUB_TOKEN

# Set graph page password (username: admin)
secret-graph:
	npx wrangler secret put GRAPH_PASSWORD

# Set on-demand flush token
secret-flush:
	npx wrangler secret put FLUSH_TOKEN

# Set AbuseIPDB API key (scanner reporting)
secret-abuseipdb:
	npx wrangler secret put ABUSEIPDB_KEY

# Manually trigger daily flush via cron (wrangler)
flush:
	npx wrangler trigger scheduled --trigger-name "0 6 * * *"

# On-demand flush via HTTP — requires FLUSH_TOKEN env var
# Usage: FLUSH_TOKEN=yourtoken make flush-url
flush-url:
	curl -s -H "X-Flush-Token: $(FLUSH_TOKEN)" "https://strongentropy.com/flush" | python3 -m json.tool

# Tail live logs
logs:
	npx wrangler tail
