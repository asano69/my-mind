# ─────────────────────────────────────────
#  Default: build & start server
# ─────────────────────────────────────────
.PHONY: all
all: frontend ## (*) Build frontend assets and start the server
	go run cmd/server/main.go

# ─────────────────────────────────────────
#  Frontend (Vite build -> internal/handler/dist, embedded via go:embed)
# ─────────────────────────────────────────
.PHONY: frontend
frontend: frontend/node_modules
	cd frontend && npm run build

frontend/node_modules: frontend/package.json frontend/package-lock.json
	cd frontend && npm ci
	touch $@

# ─────────────────────────────────────────
#  Misc
# ─────────────────────────────────────────
.PHONY: clean
clean: ## Remove build artifacts
	rm -rf internal/handler/dist

.PHONY: help
help: ## Show available targets
	@echo "Usage: make [target]"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS=":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
