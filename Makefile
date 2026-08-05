BINARY := $(notdir $(CURDIR))
APP := $(notdir $(CURDIR))
# Ports used by the dev servers (frontend, backend, and PocketBase-style API)
PORTS := 3000 3001



# ─────────────────────────────────────────
#  Default: build & start server
# ─────────────────────────────────────────
.PHONY: all
all: kill-ports frontend## (*) Build frontend assets and start the server
	go run cmd/$(BINARY)/main.go superuser upsert admin@mail.internal password --dir=pb_data
	go run cmd/$(BINARY)/main.go serve

# ─────────────────────────────────────────
#  Frontend (Vite build -> internal/handler/dist, embedded via go:embed)
# ─────────────────────────────────────────
.PHONY: frontend
frontend: frontend/node_modules
	cd frontend && pnpm run build

frontend/node_modules: frontend/package.json frontend/pnpm-lock.yaml
	cd frontend && pnpm install --frozen-lockfile
	touch $@

# ─────────────────────────────────────────
#  Misc
# ─────────────────────────────────────────
.PHONY: clean
clean: ## Remove build artifacts
	rm -rf internal/assets/dist


.PHONY: kill-ports
kill-ports:
	@for port in $(PORTS); do \
		pid=$$(lsof -ti tcp:$$port); \
		if [ -n "$$pid" ]; then \
			echo "Killing process on port $$port (pid $$pid)"; \
			kill -9 $$pid; \
		fi \
	done


.PHONY: clean
	rm -fr ./tmp/ # air

# -------------------------
# port: 3001
.PHONY: dev-front
dev-front:
	npx concurrently -n "frontend,backend" -c "blue,green" "cd frontend && pnpm dev" "go run cmd/$(BINARY)/main.go serve"

# port: 3000
.PHONY: dev-back
dev-back:
	npx concurrently -n "frontend,backend" -c "blue,green" "cd frontend && pnpm watch" "air"

.PHONY: test
test:
	cd frontend && pnpm test
	go test ./...



format:
	cd frontend && pnpm exec prettier --write "src/**/*.{js,jsx,css}"


migrate-collections:
	yes | go run ./cmd/my-mind migrate collections

build: frontend
	go build -o $(BINARY) ./cmd/$(BINARY)

