.PHONY: install dev deploy kv-create secret flush logs

install:
	npm install

# Local dev (proxies through wrangler)
dev:
	npx wrangler dev

# Deploy worker to Cloudflare
deploy:
	npx wrangler deploy

# One-time: create the KV namespace, then paste the id into wrangler.toml
kv-create:
	npx wrangler kv:namespace create VISITS

# Set the GitHub PAT secret
secret:
	npx wrangler secret put GITHUB_TOKEN

# Manually trigger the daily flush (for testing)
flush:
	npx wrangler trigger scheduled --trigger-name "0 6 * * *"

# Tail live logs
logs:
	npx wrangler tail
